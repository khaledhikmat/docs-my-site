---
title:  Return a file in ASP.NET Core from a Web API
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [ASP.NET]
---

In ASP .NET 4.x, I had this code to return a file from an ASP.NET Web API. This worked well and allowed a client-side JavaScript client to download the file with a progress indicator:

```csharp
[Route("api/some/file", Name = "SomeFile")]
public async Task<HttpResponseMessage> GetFile()
{
    var error = "";

    try
    {
		//TODO: Get the file in a string called contentData

        MemoryStream stream = new MemoryStream();
        StreamWriter writer = new StreamWriter(stream);
        writer.Write(contentData);
        writer.Flush();
        stream.Position = 0;

        var result = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StreamContent(stream)
        };
        result.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        result.Content.Headers.ContentLength = stream.Length;
        result.Content.Headers.ContentDisposition = new ContentDispositionHeaderValue("attachment")
        {
            FileName = "content.json",
            Size = stream.Length
        };

        return result;
    }
    catch (Exception e)
    {
        // The tag = ControllerName.RouteName
        error = e.Message;
		// TODO: do something with the error
        return new HttpResponseMessage(HttpStatusCode.BadRequest);
    }
}

```

Recently I created a new ASP.NET Core project for some other purpose which also had a requirement to download a file from a Web API. So naturally I copied the same code over. But that did not work...I end up getting the result in JSON....it looks something like this:

```json
{
    "version": {
        "major": 1,
        "minor": 1,
        "build": - 1,
        "revision": - 1,
        "majorRevision": - 1,
        "minorRevision": - 1
    },
    "content": {
        "headers": [{
            "key": "Content-Type",
            "value": ["application/octet-stream"]
        }, {
            "key": "Content-Length",
            "value": ["2346262"]
        }, {
            "key": "Content-Disposition",
            "value": ["attachment; filename=content.json; size=2346262"]
        }
        ]
    },
    "statusCode": 200,
    "reasonPhrase": "OK",
    "headers": [],
    "requestMessage": null,
    "isSuccessStatusCode": true
}
```

After several attempts, I eventually I found out that this below code works well in ASP.NET Core and my JavaScript is able to show a download progress bar:

```csharp
[Route("api/some/file", Name = "SomeFile")]
public async Task<HttpResponseMessage> GetFile()
{
    var error = "";

    try
    {
		//TODO: Get the file in a string called contentData

	    HttpContext.Response.ContentType = "application/json";
	    HttpContext.Response.ContentLength = Encoding.ASCII.GetBytes(contentData).Length;
	    HttpContext.Response.Headers["Content-Disposition"] = new ContentDispositionHeaderValue("attachment")
	    {
	        FileName = "content.json",
	        Size = HttpContext.Response.ContentLength
	    }.ToString();
	    HttpContext.Response.Headers["Content-Length"] = "" + HttpContext.Response.ContentLength;
	
	    FileContentResult result = new FileContentResult(Encoding.ASCII.GetBytes(contentData), "application/octet-stream")
	    {
	        FileDownloadName = "content.json"
	    };
	
	    return result;
	}
	catch (Exception e)
	{
	    // TODO: Handle error
	    HttpContext.Response.StatusCode = 400;
		...
	}
}
```
I hope this tip helps someone!
