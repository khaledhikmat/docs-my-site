---
title:  ASP.NET API Versioning
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [ASP.NET]
---

A while back, I created an ASP.NET Web API 2 to be a back-end for a mobile app. I used basic authentication to make it easier for mobile apps to consume the Web API. I now decided to provide better security so I wanted to move to a token-based authentication. The problem is that if I change the Web API to a token-based, all existing mobile apps in the field will not function as they will be refused Web API connection. 

The answer is to use Web API versioning! This way existing mobile users can continue to use the current version that uses basic authentication until the app is upgraded. The updated app version will switch over to use the new version which is based on token authentication. This post will discuss how I accomplished this versioning scheme.

## Controller Selector

The first step is to configure the ASP.NET framework to use a custom controller selector. In the `WebApiConfig` `Register` method, we tell the framework to use the custom selector:

```csharp
config.Services.Replace(typeof(IHttpControllerSelector), new VersionAwareControllerSelector(config));
``` 

The selector is coded as follows:

```csharp
public class VersionAwareControllerSelector : DefaultHttpControllerSelector
{
    private const string VERSION_HEADER_NAME = "some-value";
    private const string VERSION_QUERY_NAME = "v";

    private HttpConfiguration _configuration;

    public VersionAwareControllerSelector(HttpConfiguration configuration)
        : base(configuration)
    {
        _configuration = configuration;
    }

    // This works for Web API 2 and Attributed Routing
    // FROM: http://stackoverflow.com/questions/19835015/versioning-asp-net-web-api-2-with-media-types/19882371#19882371
    // BLOG: http://webstackoflove.com/asp-net-web-api-versioning-with-media-types/
    public override HttpControllerDescriptor SelectController(HttpRequestMessage request)
    {
        HttpControllerDescriptor controllerDescriptor = null;

        // Get a list of all controllers provided by the default selector
        IDictionary<string, HttpControllerDescriptor> controllers = GetControllerMapping();

        IHttpRouteData routeData = request.GetRouteData();

        if (routeData == null)
        {
            throw new HttpResponseException(HttpStatusCode.NotFound);
        }

        // Pick up the API Version from the header...but we could also do query string
        var apiVersion = GetVersionFromHeader(request);

        // Check if this route is actually an attribute route
        IEnumerable<IHttpRouteData> attributeSubRoutes = routeData.GetSubRoutes();

        if (attributeSubRoutes == null)
        {
            string controllerName = GetRouteVariable<string>(routeData, "controller");
            if (controllerName == null)
            {
                throw new HttpResponseException(HttpStatusCode.NotFound);
            }

            string newControllerName = String.Concat(controllerName, apiVersion);

            if (controllers.TryGetValue(newControllerName, out controllerDescriptor))
            {
                return controllerDescriptor;
            }
            else
            {
                throw new HttpResponseException(HttpStatusCode.NotFound);
            }
        }
        else
        {
            string newControllerNameSuffix = String.Concat("V", apiVersion); ;

            IEnumerable<IHttpRouteData> filteredSubRoutes = attributeSubRoutes.Where(attrRouteData =>
            {
                HttpControllerDescriptor currentDescriptor = GetControllerDescriptor(attrRouteData);
                bool match = currentDescriptor.ControllerName.EndsWith(newControllerNameSuffix);

                if (match && (controllerDescriptor == null))
                {
                    controllerDescriptor = currentDescriptor;
                }

                return match;
            });

            routeData.Values["MS_SubRoutes"] = filteredSubRoutes.ToArray();
        }

        return controllerDescriptor;
    }

    private HttpControllerDescriptor GetControllerDescriptor(IHttpRouteData routeData)
    {
        return ((HttpActionDescriptor[])routeData.Route.DataTokens["actions"]).First().ControllerDescriptor;
    }

    // Get a value from the route data, if present.
    private static T GetRouteVariable<T>(IHttpRouteData routeData, string name)
    {
        object result = null;
        if (routeData.Values.TryGetValue(name, out result))
        {
            return (T)result;
        }
        return default(T);
    }
    

    private string GetVersionFromHeader(HttpRequestMessage request)
    {
        if (request.Headers.Contains(VERSION_HEADER_NAME))
        {
            var header = request.Headers.GetValues(VERSION_HEADER_NAME).FirstOrDefault();
            if (header != null)
            {
                return header;
            }
        }

        return "1";
    }

    private string GetVersionFromQueryString(HttpRequestMessage request)
    {
        var query = HttpUtility.ParseQueryString(request.RequestUri.Query);

        var version = query[VERSION_QUERY_NAME];
        if (version != null)
        {
            return version;
        }

        return "1";
    }
}
```

As demonstarted above, I chose to send the version information as a header value! There are other options ...one of them is to pass it in the query string such as `http://example.com/api/stats?v=2`.
    
## Controller Versions

The above allows us to have versioned controllers with the following naming convention:

![Controller Versions](http://i.imgur.com/5jxk3S5.png)

The framework will pick version 1 (i.e. `StatsV1Controller`) by default unless the request's header contains a version header value. If the value is 2, then `StatsV2Controller` will be picked.

The V1 controller is defined this way:

```csharp
[BasicAuthorize()]
public class StatsV1Controller : ApiController
{
    [Route("api/stats", Name = "Stats")]
    public virtual IHttpActionResult GetStats()
    {
		....
    }
}
``` 

while the V2 controller is defined this way:

```csharp
[TokenAuthorize()]
public class StatsV2Controller : StatsV1Controller
{
    [Route("api/stats", Name = "StatsV2")]
    public override IHttpActionResult GetStats()
    {
		return base.GetStats();
    }
}
``` 

* The V1 controller uses basic authorization (as decorated by the attribute on top of the controller class) and V2 uses token authentication as decorated. 
* The V2 controller inherits from the V1 controller so there is no need to re-implement the methods.
* However, there is a need to supply a different route name for the V2 controller otherwise we will get a conflict. This is done by giving the V2 controller a route name that ends with V1 i.e. StatsV2. This is a little unfortunate but this is how it is. Had it not been for this, we could have simply inherited from V1 without having to repeat any method.
* Since V2 inherits from V1, I noticed that both authentication filters run per request. This means that when V2 is picked, the token authorize filer will run first and then followed by the basic authorize filter. This can cause problems. So what I did is at the end of the token authorize filter, I inject a value in the request properties. In the basic authorize filter, I check if the value exists, and, it if it does, I abort the basic authorize filter since the token filter has already run.


## Request Property

Here is one way to inject a property in the request in the token filter:

```csharp
actionContext.Request.Properties["some-key"] = "some-value";
```
Then in the basic filter, I check for this property existence. If it does exist, it means the request is authenticated and there is no need to perform basic authentication.

```csharp
string accessToken;
if (!actionContext.Request.Properties.TryGetValue("sone-key", out accessToken))            
{
}
```

I hope someone finds this post helpful. Having multiple versions has provided me with a way to transition my mobile app users from basic authentication to token authentication without breaking the existing mobile apps.
 