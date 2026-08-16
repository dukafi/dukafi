package main

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func uploadFields() map[string]string {
	return map[string]string{
		"id":               "acme-shipping",
		"name":             "Acme Shipping",
		"description":      "Live rates from Acme.",
		"version":          "1.2.0",
		"author":           "Acme",
		"category":         "shipping",
		"distributionType": "public",
	}
}

type uploadFile struct {
	field, filename string
	body            []byte
}

func doUpload(t *testing.T, api *API, fields map[string]string, archive []byte, filename string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var files []uploadFile
	if archive != nil {
		files = append(files, uploadFile{field: "archive", filename: filename, body: archive})
	}
	return doUploadFiles(t, api, fields, files, headers)
}

func doUploadFiles(t *testing.T, api *API, fields map[string]string, files []uploadFile, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		if err := writer.WriteField(name, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, file := range files {
		part, err := writer.CreateFormFile(file.field, file.filename)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(file.body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/me/plugins", &body)
	req.RemoteAddr = "203.0.113.9:1234"
	req.Header.Set("Content-Type", writer.FormDataContentType())
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	api.Handler().ServeHTTP(recorder, req)
	return recorder
}

func TestADashboardUploadIsHostedAndServedFromThisRegistry(t *testing.T) {
	body := gzipBytes(t, "plugin-bytes")
	archives := &stubArchives{body: []byte("should-not-be-fetched")}
	api := newHostingAPI(t, &stubFetcher{manifest: &Manifest{}}, archives)

	recorder := doUpload(t, api, uploadFields(), body, "acme-shipping-1.2.0.tar.gz", author(t, api))
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("upload: %d %s", recorder.Code, recorder.Body.String())
	}
	if archives.calls != 0 {
		t.Fatalf("an upload still fetched a URL: %d calls", archives.calls)
	}
	plugin := decode(t, recorder)["plugin"].(map[string]any)
	if plugin["hosted"] != true {
		t.Fatalf("hosted flag: %v", plugin["hosted"])
	}
	if _, ok := plugin["manifestUrl"]; ok {
		t.Fatal("a hosted listing still exposed a manifest URL")
	}

	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())
	download := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil)
	if download.Code != http.StatusOK {
		t.Fatalf("download: %d %s", download.Code, download.Body.String())
	}
	if !bytes.Equal(download.Body.Bytes(), body) {
		t.Fatal("the stored archive was not what was uploaded")
	}
	public := decode(t, do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil))
	distribution := public["distribution"].(map[string]any)
	if distribution["downloadUrl"] != "https://registry.dukafi.dev/v1/plugins/acme-shipping/download" {
		t.Fatalf("downloadUrl %v", distribution["downloadUrl"])
	}
}

func TestADashboardUploadRefusesANonGzip(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	recorder := doUpload(t, api, uploadFields(), []byte("not-gzip"), "plugin.tar.gz", author(t, api))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestADashboardUploadRequiresAnArchiveForPublicPlugins(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	recorder := doUpload(t, api, uploadFields(), nil, "", author(t, api))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestAHostedListingCannotBeRefreshedFromAURL(t *testing.T) {
	body := gzipBytes(t, "hosted")
	api := newHostingAPI(t, &stubFetcher{manifest: &Manifest{}}, &stubArchives{})
	headers := author(t, api)
	if recorder := doUpload(t, api, uploadFields(), body, "plugin.tar.gz", headers); recorder.Code != http.StatusAccepted {
		t.Fatalf("upload: %d %s", recorder.Code, recorder.Body.String())
	}
	refresh := do(t, api, "POST", "/v1/me/plugins/acme-shipping/refresh", nil, headers)
	if refresh.Code != http.StatusConflict {
		t.Fatalf("refresh: %d %s", refresh.Code, refresh.Body.String())
	}
	refreshed, failed := api.RefreshAll(t.Context())
	if refreshed != 0 || failed != 0 {
		t.Fatalf("the sweep tried to fetch a hosted listing: refreshed=%d failed=%d", refreshed, failed)
	}
}

func TestALicensedDashboardPublishNeedsNoArchive(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	fields := uploadFields()
	fields["distributionType"] = "licensed"
	fields["licenseUrl"] = "https://acme.example/api/download"
	fields["pricingModel"] = "paid"
	fields["price"] = "$49/year"
	fields["purchaseUrl"] = "https://acme.example/buy"
	recorder := doUpload(t, api, fields, nil, "", author(t, api))
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("licensed upload: %d %s", recorder.Code, recorder.Body.String())
	}
	plugin := decode(t, recorder)["plugin"].(map[string]any)
	if plugin["licensed"] != true {
		t.Fatalf("licensed flag: %v", plugin["licensed"])
	}
}

func TestADashboardUploadRejectsAnOversizedArchive(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	huge := bytes.Repeat([]byte{0x1f, 0x8b}, (maxArchiveLen/2)+1)
	recorder := doUpload(t, api, uploadFields(), huge, "plugin.tar.gz", author(t, api))
	if recorder.Code != http.StatusRequestEntityTooLarge && recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestJSONManifestPublishStillWorks(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	recorder := publishAs(t, api, author(t, api), "https://acme.example.com/plugin.json")
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("JSON publish: %d %s", recorder.Code, recorder.Body.String())
	}
	plugin := decode(t, recorder)["plugin"].(map[string]any)
	if plugin["hosted"] == true {
		t.Fatal("a URL submission was marked hosted")
	}
	if plugin["manifestUrl"] != "https://acme.example.com/plugin.json" {
		t.Fatalf("manifestUrl %v", plugin["manifestUrl"])
	}
}

func TestAnOwnerCanUpdateAHostedPluginWithoutANewArchive(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	headers := author(t, api)
	first := gzipBytes(t, "v1")
	if recorder := doUpload(t, api, uploadFields(), first, "plugin.tar.gz", headers); recorder.Code != http.StatusAccepted {
		t.Fatalf("first: %d %s", recorder.Code, recorder.Body.String())
	}

	fields := uploadFields()
	fields["name"] = "Acme Shipping Pro"
	fields["version"] = "1.3.0"
	fields["description"] = "Live rates, now with tracking."
	recorder := doUpload(t, api, fields, nil, "", headers)
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("update: %d %s", recorder.Code, recorder.Body.String())
	}
	plugin := decode(t, recorder)["plugin"].(map[string]any)
	if plugin["name"] != "Acme Shipping Pro" || plugin["version"] != "1.3.0" {
		t.Fatalf("listing was not updated: %v", plugin)
	}
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())
	download := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil)
	if !bytes.Equal(download.Body.Bytes(), first) {
		t.Fatal("updating listing fields replaced the archive")
	}
}

func TestAnOwnerCanReplaceTheArchiveOnUpdate(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	headers := author(t, api)
	if recorder := doUpload(t, api, uploadFields(), gzipBytes(t, "v1"), "plugin.tar.gz", headers); recorder.Code != http.StatusAccepted {
		t.Fatalf("first: %d %s", recorder.Code, recorder.Body.String())
	}
	second := gzipBytes(t, "v2")
	fields := uploadFields()
	fields["version"] = "2.0.0"
	if recorder := doUpload(t, api, fields, second, "plugin.tar.gz", headers); recorder.Code != http.StatusAccepted {
		t.Fatalf("update: %d %s", recorder.Code, recorder.Body.String())
	}
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())
	download := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil)
	if !bytes.Equal(download.Body.Bytes(), second) {
		t.Fatal("the new archive was not served")
	}
}

func TestUpdatingARejectedPluginPutsItBackInTheQueue(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	headers := author(t, api)
	if recorder := doUpload(t, api, uploadFields(), gzipBytes(t, "v1"), "plugin.tar.gz", headers); recorder.Code != http.StatusAccepted {
		t.Fatalf("first: %d %s", recorder.Code, recorder.Body.String())
	}
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/reject",
		map[string]string{"reason": "needs a clearer description"}, admin())

	fields := uploadFields()
	fields["description"] = "Live rates from Acme at checkout, with tracking."
	recorder := doUpload(t, api, fields, nil, "", headers)
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("update: %d %s", recorder.Code, recorder.Body.String())
	}
	plugin := decode(t, recorder)["plugin"].(map[string]any)
	if plugin["status"] != StatusPending {
		t.Fatalf("rejected update stayed %v", plugin["status"])
	}
}
