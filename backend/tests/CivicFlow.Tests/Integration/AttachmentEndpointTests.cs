using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using CivicFlow.Application.Attachments;
using CivicFlow.Application.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class AttachmentEndpointTests(CivicFlowApiFactory factory)
{
    private static Task<HttpResponseMessage> UploadAsync(
        HttpClient client, int caseId, byte[] content, string fileName, string contentType = "application/octet-stream")
    {
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var form = new MultipartFormDataContent { { file, "file", fileName } };
        return client.PostAsync($"/api/cases/{caseId}/attachments", form);
    }

    [Fact]
    public async Task An_uploaded_file_is_listed_and_downloads_intact()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(client);
        var content = Encoding.UTF8.GetBytes("Site plan notes\n");

        // The client's content type is ignored; the extension decides what the file is served as.
        var response = await UploadAsync(client, @case.Id, content, "site plan.txt", "application/x-msdownload");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var uploaded = (await response.Content.ReadFromJsonAsync<AttachmentDto>(TestJson.Options))!;
        Assert.Equal($"/api/attachments/{uploaded.Id}/download", response.Headers.Location!.OriginalString);
        Assert.Equal("site plan.txt", uploaded.FileName);
        Assert.Equal("text/plain", uploaded.ContentType);
        Assert.Equal(content.Length, uploaded.Size);
        Assert.Equal("Luis Ortega", uploaded.UploadedBy.FullName);

        var list = await client.GetFromJsonAsync<PagedResult<AttachmentDto>>($"/api/cases/{@case.Id}/attachments", TestJson.Options);
        Assert.Equal([uploaded.Id], list!.Items.Select(a => a.Id));

        var download = await client.GetAsync($"/api/attachments/{uploaded.Id}/download");
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal(content, await download.Content.ReadAsByteArrayAsync());
        Assert.Equal("text/plain", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal("site plan.txt", download.Content.Headers.ContentDisposition.FileNameStar);
        Assert.Equal("nosniff", Assert.Single(download.Headers.GetValues("X-Content-Type-Options")));
    }

    [Fact]
    public async Task Files_are_stored_under_random_names_outside_the_web_root()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(client);

        var response = await UploadAsync(client, @case.Id, [1, 2, 3], @"C:\Users\pat\Desktop\photo.PNG");

        var uploaded = (await response.Content.ReadFromJsonAsync<AttachmentDto>(TestJson.Options))!;
        Assert.Equal("photo.PNG", uploaded.FileName);
        Assert.Equal("image/png", uploaded.ContentType);

        await using var db = factory.CreateDbContext();
        var storagePath = await db.Attachments.Where(a => a.Id == uploaded.Id).Select(a => a.StoragePath).SingleAsync();
        Assert.Matches("^[0-9a-f]{32}$", storagePath);
        Assert.True(File.Exists(Path.Combine(factory.FileStorageRoot, storagePath)));
    }

    [Theory]
    [InlineData("setup.exe", 10)]
    [InlineData("noextension", 10)]
    [InlineData("empty.pdf", 0)]
    [InlineData("huge.pdf", AttachmentRules.MaxSizeBytes + 1)]
    public async Task Disallowed_empty_and_oversized_files_are_400(string fileName, long size)
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(client);

        var response = await UploadAsync(client, @case.Id, new byte[size], fileName);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Contains("File", problem!.Errors.Keys);
        var list = await client.GetFromJsonAsync<PagedResult<AttachmentDto>>($"/api/cases/{@case.Id}/attachments", TestJson.Options);
        Assert.Empty(list!.Items);
    }

    [Fact]
    public async Task Attachments_follow_the_cases_visibility()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(planner);
        var uploaded = (await (await UploadAsync(planner, @case.Id, [1], "a.pdf")).Content.ReadFromJsonAsync<AttachmentDto>(TestJson.Options))!;
        var outsider = await factory.CreateClientAsAsync("ce.staff1@civicflow.test");

        var list = await outsider.GetAsync($"/api/cases/{@case.Id}/attachments");
        var upload = await UploadAsync(outsider, @case.Id, [1], "b.pdf");
        var download = await outsider.GetAsync($"/api/attachments/{uploaded.Id}/download");
        var missing = await planner.GetAsync("/api/attachments/999999/download");

        Assert.Equal(HttpStatusCode.Forbidden, list.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, upload.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, download.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Uploading_without_a_file_is_400()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(client);

        var response = await client.PostAsync(
            $"/api/cases/{@case.Id}/attachments", new MultipartFormDataContent { { new StringContent("x"), "note" } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
