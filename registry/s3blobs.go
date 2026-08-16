package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

// S3Blobs stores public archives in an S3-compatible bucket — Railway
// Storage Buckets on the registry's project canvas.
//
// The bucket is private. Stores still download through this process
// (`GET /v1/plugins/{id}/download`), which is what lets us 404 a pending
// listing and attach the checksum header. The bytes themselves live in the
// bucket, not on the SQLite volume.
type S3Blobs struct {
	client *s3.Client
	bucket string
}

const s3OpTimeout = 20 * time.Second

func NewS3Blobs(client *s3.Client, bucket string) *S3Blobs {
	return &S3Blobs{client: client, bucket: bucket}
}

// openBlobStore picks Railway S3 when bucket credentials are in the
// environment, and the local directory next to the database otherwise.
func openBlobStore(dbPath string) (BlobStore, string, error) {
	bucket := firstEnv("BUCKET", "REGISTRY_S3_BUCKET", "AWS_S3_BUCKET", "S3_BUCKET")
	if bucket == "" {
		root := filepath.Join(filepath.Dir(dbPath), "plugins")
		return &PluginBlobs{Root: root}, "disk " + root, nil
	}
	store, err := newS3BlobsFromEnv(bucket)
	if err != nil {
		return nil, "", err
	}
	return store, "s3://" + bucket, nil
}

func newS3BlobsFromEnv(bucket string) (*S3Blobs, error) {
	// Railway Storage injects these names. AWS SDK names are accepted as a
	// fallback if someone used that preset instead.
	access := firstEnv("ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID")
	secret := firstEnv("SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY")
	if access == "" || secret == "" {
		return nil, errors.New("S3 bucket is set but ACCESS_KEY_ID / SECRET_ACCESS_KEY are not")
	}
	region := firstEnv("REGION", "AWS_REGION", "AWS_DEFAULT_REGION")
	if region == "" {
		region = "auto"
	}
	endpoint := firstEnv("ENDPOINT", "AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL")
	if endpoint == "" {
		endpoint = "https://storage.railway.app"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(access, secret, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("s3 config: %w", err)
	}

	pathStyle := os.Getenv("REGISTRY_S3_PATH_STYLE") == "1" || os.Getenv("AWS_S3_FORCE_PATH_STYLE") == "true"
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = pathStyle
	})
	return NewS3Blobs(client, bucket), nil
}

func (b *S3Blobs) key(id, sha string) (string, error) {
	if !idPattern.MatchString(id) || !sha256Pattern.MatchString(sha) {
		return "", ErrBadBlobKey
	}
	return "plugins/" + id + "/" + sha + ".tar.gz", nil
}

func (b *S3Blobs) Has(id, sha string) bool {
	key, err := b.key(id, sha)
	if err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), s3OpTimeout)
	defer cancel()
	_, err = b.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err == nil {
		return true
	}
	if !s3Missing(err) {
		log.Printf("registry: s3 head %s: %v", key, err)
	}
	return false
}

func (b *S3Blobs) Get(id, sha string) ([]byte, error) {
	key, err := b.key(id, sha)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), s3OpTimeout)
	defer cancel()
	out, err := b.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if s3Missing(err) {
			return nil, ErrNoBlob
		}
		return nil, err
	}
	defer out.Body.Close()
	body, err := io.ReadAll(io.LimitReader(out.Body, int64(maxArchiveLen)+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxArchiveLen {
		return nil, ErrArchiveTooLarge
	}
	return body, nil
}

func (b *S3Blobs) Put(id, sha string, body []byte) error {
	if err := checkArchive(body, sha); err != nil {
		return err
	}
	key, err := b.key(id, sha)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), s3OpTimeout)
	defer cancel()
	_, err = b.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(b.bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(body),
		ContentType:   aws.String("application/gzip"),
		ContentLength: aws.Int64(int64(len(body))),
	})
	return err
}

func (b *S3Blobs) mediaKey(id, name string) (string, error) {
	if !idPattern.MatchString(id) {
		return "", ErrBadBlobKey
	}
	safe, err := mediaName(name)
	if err != nil {
		return "", err
	}
	return "plugins/" + id + "/media/" + safe, nil
}

func (b *S3Blobs) HasMedia(id, name string) bool {
	key, err := b.mediaKey(id, name)
	if err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), s3OpTimeout)
	defer cancel()
	_, err = b.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err == nil {
		return true
	}
	if !s3Missing(err) {
		log.Printf("registry: s3 head %s: %v", key, err)
	}
	return false
}

func (b *S3Blobs) GetMedia(id, name string) ([]byte, string, error) {
	key, err := b.mediaKey(id, name)
	if err != nil {
		return nil, "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), s3OpTimeout)
	defer cancel()
	out, err := b.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if s3Missing(err) {
			return nil, "", ErrNoBlob
		}
		return nil, "", err
	}
	defer out.Body.Close()
	body, err := io.ReadAll(io.LimitReader(out.Body, int64(maxImageLen)+1))
	if err != nil {
		return nil, "", err
	}
	if len(body) > maxImageLen {
		return nil, "", ErrImageHuge
	}
	contentType := "application/octet-stream"
	if out.ContentType != nil && *out.ContentType != "" {
		contentType = *out.ContentType
	}
	return body, contentType, nil
}

func (b *S3Blobs) PutMedia(id, name string, body []byte, contentType string) error {
	if len(body) > maxImageLen {
		return ErrImageHuge
	}
	if _, err := sniffImage(body); err != nil {
		return err
	}
	key, err := b.mediaKey(id, name)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), s3OpTimeout)
	defer cancel()
	_, err = b.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(b.bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(body),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(int64(len(body))),
	})
	return err
}

func s3Missing(err error) bool {
	var notFound *types.NotFound
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &notFound) || errors.As(err, &noSuchKey) {
		return true
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "NotFound", "NoSuchKey", "NoSuchBucket":
			return true
		}
	}
	return false
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}
