package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
)

const maxUploadForm = maxArchiveLen + (maxImages+1)*maxImageLen + 64*1024

// publishUpload is the dashboard path: the author fills in the listing and
// attaches the gzip. Nothing is fetched. The archive lives here afterwards,
// so a public plugin does not need a host of its own.
func (a *API) publishUpload(w http.ResponseWriter, r *http.Request, account Account) {
	r.Body = http.MaxBytesReader(w, r.Body, int64(maxUploadForm))
	if err := r.ParseMultipartForm(int64(maxUploadForm)); err != nil {
		if isTooLarge(err) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", ErrArchiveTooLarge.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_body", "could not read the upload")
		return
	}

	manifest, note, err := listingFromForm(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if len(note) > 1000 {
		writeError(w, http.StatusBadRequest, "invalid_body", "note is too long")
		return
	}
	a.keepExistingListing(manifest, account.ID)
	if err := a.storeUploadedMedia(r, manifest); err != nil {
		a.writeIngestError(w, err)
		return
	}

	if manifest.Distribution.Type == DistributionPublic {
		body, err := readOptionalArchive(r)
		if err != nil {
			if isTooLarge(err) {
				writeError(w, http.StatusRequestEntityTooLarge, "too_large", ErrArchiveTooLarge.Error())
				return
			}
			a.writeIngestError(w, err)
			return
		}
		if body != nil {
			sum := sha256.Sum256(body)
			manifest.Distribution.SHA256 = hex.EncodeToString(sum[:])
			manifest.Distribution.DownloadURL = a.hostedDownloadURL(manifest.ID)
			if err := a.putUploadedArchive(manifest.ID, manifest.Distribution.SHA256, body); err != nil {
				a.writeIngestError(w, err)
				return
			}
		} else if manifest.Distribution.SHA256 == "" {
			a.writeIngestError(w, invalid("archive", "a .tar.gz of the plugin is required"))
			return
		}
		if err := manifest.Validate(a.AllowInsecure); err != nil {
			a.writeIngestError(w, err)
			return
		}
	} else {
		if err := manifest.Validate(a.AllowInsecure); err != nil {
			a.writeIngestError(w, err)
			return
		}
	}

	plugin, err := a.Store.Submit(manifest, hostedManifestURL(manifest.ID), note, account.ID)
	if errors.Is(err, ErrDuplicate) {
		writeError(w, http.StatusConflict, "duplicate_id",
			"another account already lists the id "+manifest.ID)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not record that plugin")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"plugin": a.ownerView(plugin)})
}

func listingFromForm(r *http.Request) (*Manifest, string, error) {
	form := r.MultipartForm
	if form == nil {
		return nil, "", errors.New("could not read the upload")
	}
	value := func(name string) string {
		if values := form.Value[name]; len(values) > 0 {
			return strings.TrimSpace(values[0])
		}
		return ""
	}

	images := []string{}
	for _, line := range strings.FieldsFunc(value("images"), func(r rune) bool {
		return r == '\n' || r == ',' || r == '\r'
	}) {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			images = append(images, trimmed)
		}
	}

	manifest := &Manifest{
		ID:               value("id"),
		Name:             value("name"),
		Description:      value("description"),
		Version:          value("version"),
		Author:           value("author"),
		Homepage:         value("homepage"),
		Category:         value("category"),
		License:          value("license"),
		Logo:             value("logo"),
		Images:           images,
		MinDukafiVersion: value("minDukafiVersion"),
		Pricing: Pricing{
			Model:       value("pricingModel"),
			Price:       value("price"),
			PurchaseURL: value("purchaseUrl"),
		},
		Distribution: Distribution{
			Type:       value("distributionType"),
			LicenseURL: value("licenseUrl"),
			CheckURL:   value("checkUrl"),
		},
	}
	return manifest, value("note"), nil
}

func readOptionalArchive(r *http.Request) ([]byte, error) {
	file, header, err := r.FormFile("archive")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			return nil, nil
		}
		return nil, invalid("archive", "could not read the upload")
	}
	defer file.Close()
	if header.Size > maxArchiveLen {
		return nil, ErrArchiveTooLarge
	}
	body, err := io.ReadAll(io.LimitReader(file, maxArchiveLen+1))
	if err != nil {
		return nil, invalid("archive", "could not read the upload")
	}
	if len(body) > maxArchiveLen {
		return nil, ErrArchiveTooLarge
	}
	if len(body) == 0 {
		return nil, invalid("archive", "the upload was empty")
	}
	return body, nil
}

func (a *API) keepExistingListing(manifest *Manifest, accountID string) {
	if manifest == nil || manifest.ID == "" {
		return
	}
	existing, err := a.Store.Get(manifest.ID)
	if err != nil || existing.AccountID == "" || existing.AccountID != accountID {
		return
	}
	if manifest.Logo == "" {
		manifest.Logo = existing.Logo
	}
	if len(manifest.Images) == 0 {
		manifest.Images = existing.Images
	}
	if manifest.Distribution.Type == DistributionPublic {
		if manifest.Distribution.SHA256 == "" {
			manifest.Distribution.SHA256 = existing.Distribution.SHA256
		}
		if manifest.Distribution.DownloadURL == "" {
			manifest.Distribution.DownloadURL = existing.Distribution.DownloadURL
			if manifest.Distribution.DownloadURL == "" && existing.Distribution.SHA256 != "" {
				manifest.Distribution.DownloadURL = a.hostedDownloadURL(manifest.ID)
			}
		}
	} else if manifest.Distribution.Type == DistributionLicensed {
		if manifest.Distribution.LicenseURL == "" {
			manifest.Distribution.LicenseURL = existing.Distribution.LicenseURL
		}
		if manifest.Distribution.CheckURL == "" {
			manifest.Distribution.CheckURL = existing.Distribution.CheckURL
		}
	}
	if manifest.Pricing.Model == "" {
		manifest.Pricing = existing.Pricing
	}
}

func (a *API) storeUploadedMedia(r *http.Request, manifest *Manifest) error {
	if a.Blobs == nil || manifest == nil {
		return nil
	}
	if body, err := readOptionalImage(r, "logo"); err != nil {
		return err
	} else if body != nil {
		ctype, err := sniffImage(body)
		if err != nil {
			return invalid("logo", err.Error())
		}
		if err := a.Blobs.PutMedia(manifest.ID, "logo", body, ctype); err != nil {
			return mediaPutError("logo", err)
		}
		manifest.Logo = a.hostedMediaURL(manifest.ID, "logo")
	}

	files := []*multipart.FileHeader{}
	if r.MultipartForm != nil {
		files = r.MultipartForm.File["screenshots"]
	}
	if len(files) == 0 {
		return nil
	}
	if len(files) > maxImages {
		return invalid("screenshots", fmt.Sprintf("at most %d screenshots", maxImages))
	}
	images := make([]string, 0, len(files))
	for i, header := range files {
		body, err := readMultipartImage(header)
		if err != nil {
			return err
		}
		ctype, err := sniffImage(body)
		if err != nil {
			return invalid("screenshots", err.Error())
		}
		name := screenshotName(i)
		if err := a.Blobs.PutMedia(manifest.ID, name, body, ctype); err != nil {
			return mediaPutError("screenshots", err)
		}
		images = append(images, a.hostedMediaURL(manifest.ID, name))
	}
	manifest.Images = images
	return nil
}

func mediaPutError(field string, err error) error {
	if errors.Is(err, ErrNotImage) || errors.Is(err, ErrImageHuge) || errors.Is(err, ErrBadBlobKey) {
		return invalid(field, err.Error())
	}
	return err
}

func readOptionalImage(r *http.Request, field string) ([]byte, error) {
	file, header, err := r.FormFile(field)
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			return nil, nil
		}
		return nil, invalid(field, "could not read the upload")
	}
	defer file.Close()
	_ = header
	return readImageBytes(file, field)
}

func readMultipartImage(header *multipart.FileHeader) ([]byte, error) {
	file, err := header.Open()
	if err != nil {
		return nil, invalid("screenshots", "could not read the upload")
	}
	defer file.Close()
	return readImageBytes(file, "screenshots")
}

func readImageBytes(file io.Reader, field string) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(file, int64(maxImageLen)+1))
	if err != nil {
		return nil, invalid(field, "could not read the upload")
	}
	if len(body) > maxImageLen {
		return nil, ErrImageHuge
	}
	if len(body) == 0 {
		return nil, invalid(field, "the upload was empty")
	}
	if _, err := sniffImage(body); err != nil {
		return nil, invalid(field, err.Error())
	}
	return body, nil
}

func (a *API) putUploadedArchive(id, sha string, body []byte) error {
	if a.Blobs == nil {
		return errors.New("this registry is not storing archives")
	}
	if err := a.Blobs.Put(id, sha, body); err != nil {
		if errors.Is(err, ErrNotGzip) {
			return invalid("archive", ErrNotGzip.Error())
		}
		if errors.Is(err, ErrChecksumMismatch) {
			return invalid("archive", ErrChecksumMismatch.Error())
		}
		if errors.Is(err, ErrBadBlobKey) {
			return invalid("id", err.Error())
		}
		return err
	}
	return nil
}

func isTooLarge(err error) bool {
	var maxBytes *http.MaxBytesError
	return errors.As(err, &maxBytes) || errors.Is(err, ErrArchiveTooLarge) || errors.Is(err, ErrImageHuge)
}
