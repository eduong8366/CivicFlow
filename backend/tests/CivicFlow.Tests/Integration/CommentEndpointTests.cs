using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Comments;
using CivicFlow.Application.Common;
using Microsoft.AspNetCore.Mvc;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class CommentEndpointTests(CivicFlowApiFactory factory)
{
    [Fact]
    public async Task Comments_are_added_and_listed_oldest_first()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(client);

        var first = await client.PostAsJsonAsync($"/api/cases/{@case.Id}/comments", new { body = "  Called the applicant.  " });
        var second = await client.PostAsJsonAsync(
            $"/api/cases/{@case.Id}/comments", new CreateCommentRequest("Your plans are under review.", IsInternal: false), TestJson.Options);

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var created = (await first.Content.ReadFromJsonAsync<CommentDto>(TestJson.Options))!;
        Assert.Equal("Called the applicant.", created.Body);
        Assert.True(created.IsInternal, "Comments are internal unless marked otherwise.");
        Assert.Equal("Luis Ortega", created.Author.FullName);

        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        var comments = await client.GetFromJsonAsync<PagedResult<CommentDto>>($"/api/cases/{@case.Id}/comments", TestJson.Options);
        Assert.Equal(["Called the applicant.", "Your plans are under review."], comments!.Items.Select(c => c.Body));
        Assert.Equal([true, false], comments.Items.Select(c => c.IsInternal));
    }

    [Fact]
    public async Task A_blank_comment_is_400()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(client);

        var response = await client.PostAsJsonAsync($"/api/cases/{@case.Id}/comments", new CreateCommentRequest("   "), TestJson.Options);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Contains("Body", problem!.Errors.Keys);
    }

    [Fact]
    public async Task Comments_follow_the_cases_visibility()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(planner);
        var outsider = await factory.CreateClientAsAsync("ce.staff1@civicflow.test");

        var read = await outsider.GetAsync($"/api/cases/{@case.Id}/comments");
        var write = await outsider.PostAsJsonAsync($"/api/cases/{@case.Id}/comments", new CreateCommentRequest("Hi"), TestJson.Options);
        var missing = await planner.GetAsync("/api/cases/999999/comments");

        Assert.Equal(HttpStatusCode.Forbidden, read.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task A_reason_for_a_status_change_is_kept_as_an_internal_comment()
    {
        var supervisor = await factory.CreateClientAsAsync("pz.supervisor@civicflow.test");
        var @case = await CreateBuildingPermitAsync(supervisor);

        var held = await supervisor.PostAsJsonAsync($"/api/cases/{@case.Id}/hold", new { reason = "Awaiting the owner's signature." });
        var resumed = await supervisor.PostAsync($"/api/cases/{@case.Id}/reopen", null);

        await ReadCaseAsync(held);
        await ReadCaseAsync(resumed);
        var comments = await supervisor.GetFromJsonAsync<PagedResult<CommentDto>>($"/api/cases/{@case.Id}/comments", TestJson.Options);
        var comment = Assert.Single(comments!.Items);
        Assert.Equal("Put on hold: Awaiting the owner's signature.", comment.Body);
        Assert.True(comment.IsInternal);
    }
}
