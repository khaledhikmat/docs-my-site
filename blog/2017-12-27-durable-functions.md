---
title:  Actors in Serverless
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Azure Functions]
---

I started with this [documentation page](https://docs.microsoft.com/en-us/azure/azure-functions/durable-functions-install) to learn about Azure durable Functions. I wanted to know if I can build a way to implement actors in Azure Functions. Actors Programming Model is pretty interesting and I did some work on it [here](http://khaledhikmat.github.io/posts/2016-12-15-service-fabric-fundamentals), [here](http://khaledhikmat.github.io/posts/2016-12-02-service-fabric-basics) and [here](http://khaledhikmat.github.io/posts/2017-01-10-service-fabric-notes) using [Azure Service Fabric](https://azure.microsoft.com/en-us/services/service-fabric/) before.

Following the Azure Functions sample instructions mentioned in the above link, I quickly got up and running. However, I wanted to answer the following questions about actors in Azure Functions:

- Create a new actor giving a provided actor id
- Signal an existing actor to perform something
- When do actors get created?
- When do actors get terminated?
- Can we read the actor's internal state?
- What about .NET Core and .NET Standard 2.0 and other stuff?

## Create a new actor:

I created an HTTP trigger that looks like this where I provide a code that can be used as an instance id for the singleton i.e. membership actor. If the membership actor status is null or not running, then I start it with a `StartNewAsync`: 

```
[FunctionName("HttpRefreshMemberships")]
public static async Task<HttpResponseMessage> Run(
    [HttpTrigger(AuthorizationLevel.Function, methods: "post", Route = "memberships/refresh/{code}")] HttpRequestMessage req,
    [OrchestrationClient] DurableOrchestrationClient starter,
    string code,
    TraceWriter log)
{
    var membershipStatus = await starter.GetStatusAsync(code);
    string runningStatus = membershipStatus == null ? "NULL" : membershipStatus.RuntimeStatus.ToString();
    log.Info($"Instance running status: '{runningStatus}'.");

    if (
        membershipStatus == null || 
        membershipStatus.RuntimeStatus != OrchestrationRuntimeStatus.Running
        )
    {
        var membership = new {
            Id = "asas",
            Code = code,
            CardNumber = "977515900121213"
        };

        await starter.StartNewAsync("E3_Membership", code, membership);
        log.Info($"Started a new membership actor with code = '{code}'.");
    }
    else
    {
        await starter.RaiseEventAsync(code, "operation", "refresh");
        log.Info($"Refreshed an existing membership actor with code = '{code}'.");
    }

    var res = starter.CreateCheckStatusResponse(req, code);
    res.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(10));
    return res;
}
```

## Signal an existing actor to perform something

If the membership actor does exist, we raise a `refresh` event to wake up the singleton so it can do work:

```
await starter.RaiseEventAsync(code, "operation", "refresh");
```

The actual membership actor code looks like this:

```
public static class Membership
{
    [FunctionName("E3_Membership")]
    public static async Task<dynamic> Run(
        [OrchestrationTrigger] DurableOrchestrationContext context,
        TraceWriter log)
    {
        dynamic membership = context.GetInput<dynamic>();
        if (membership == null)
            log.Info($"Something is bad! I should start with a valid membership.");

        var operation = await context.WaitForExternalEvent<string>("operation");
        log.Info($"***** received '{operation}' event.");

        operation = operation?.ToLowerInvariant();
        if (operation == "refresh")
        {
            membership = await Refresh(context, log);
        }

        if (operation != "end")
        {
            context.ContinueAsNew(membership);
        }

        return membership;
    }

    public static async Task<dynamic> Refresh(DurableOrchestrationContext context,
                                              TraceWriter log)
    {
        // TODO: Do something to refresh the membership
        dynamic membership = new {
            Id = "asas",
            Code = context.InstanceId,
            CardNumber = "977515900121213"
        };

        DateTime now = DateTime.Now;
        string formatDate = now.ToString("MM/dd/yyyy hh:mm:ss.fff tt");
        log.Info($"**** done refreshing '{context.InstanceId}' @ {formatDate}");
        return membership;
    }
}
```

### Multiple signals

But what happens if the actor is signaled frantically via raising an external event from an HTTP trigger, for example? The event signals are actually enqueued to the instance so they should run as many  times as they are sginaled. 

If you are observing the actor's streaming logs when you try this, it could get very confusing. This is because durable functions manage long-term running processes in short-lived functions is by taking advantage of state retrieved in the `context` and replaying the function to resume at the next step (from [this article](https://hackernoon.com/serverless-and-bitcoin-creating-price-watchers-dynamically-beea36ef194e)). Effectively what you will see if that functions are started, completed and re-started again to resume state.     

### Code Delays

Singletons should not use `Task` functions such as `Task.Delay(millis)` to simulate code delays. This will cause run-time errors:

```
Function 'E3_Membership (Orchestrator)', version '' failed with an error. Reason: System.InvalidOperationException: Multithreaded execution was detected. his can happen if the orchestrator function previously resumed from an unsupported async callback.
```

The preferred way for delays or timeouts is:

```
await context.CreateTimer(deadline, CancellationToken.None);
```

Where `deadline` is defined:

```
DateTime deadline = context.CurrentUtcDateTime.AddMinutes(30);
```

It is very important that we leverage the `context` to provide accurate timer information as opposed to `TimeSpan` and `DateTime.Now`, etc. I have seen very varying (not correct) results when I used `TimeSpan.FromMinutes(30)`, for example. 

### Wait on multiple events

What if we want the actor to wait on an external event or on a internal timeout event to perhaps refresh our membership periodically? I created another membership function i.e. `E3_MembershipWithTimer` that awaits on either an operation event or a timeout event:

```
[FunctionName("E3_MembershipWithTimer")]
public static async Task<dynamic> RunWithTimer(
    [OrchestrationTrigger] DurableOrchestrationContext context,
    TraceWriter log)
{
    log.Info($"E3_MembershipWithTimer starting.....");
    dynamic membership = context.GetInput<dynamic>();
    if (membership == null)
        log.Info($"Something is bad! I should start with a valid membership.");

    string operation = "refresh";
    using (var cts = new CancellationTokenSource())
    {
        var operationTask = context.WaitForExternalEvent<string>("operation");
        DateTime deadline = context.CurrentUtcDateTime.AddMinutes(30);
        var timeoutTask = context.CreateTimer(deadline, cts.Token);

        Task winner = await Task.WhenAny(operationTask, timeoutTask);
        if (winner == operationTask)
        {
            log.Info($"An operation event received!");
            operation = operationTask.Result;
            cts.Cancel();
        }
        else
        {
            // Default the timeout task to mean a 'refresh' operation
            log.Info($"A timeout event received!");
            operation = "refresh";
        }
    }

    log.Info($"***** received '{operation}' event.");

    operation = operation?.ToLowerInvariant();
    if (operation == "refresh")
    {
        membership = await Refresh(context, log);
    }

    if (operation != "end")
    {
        context.ContinueAsNew(membership);
    }

    return membership;
}
```
 
## When do actors get created?

Actors or singletons actually do persist in storage (please see the section about termination)......this is how an Azure Functions knows how to start them when it restarts. So if you create actors with specific instance ids (or actor ids), shut down the functions and restart it, the singleton instances are available. When you want to trigger an instance, you must check its running state and then invoke the proper API:

```
var membershipStatus = await starter.GetStatusAsync(code);
string runningStatus = membershipStatus == null ? "NULL" : membershipStatus.RuntimeStatus.ToString();
log.Info($"Instance running status: '{runningStatus}'.");

if (
    membershipStatus == null || 
    membershipStatus.RuntimeStatus != OrchestrationRuntimeStatus.Running
    )
{
    var membership = new {
        Id = "asas",
        Code = code,
        CardNumber = "977515900121213"
    };

    await starter.StartNewAsync("E3_Membership", code, membership);
    log.Info($"Started a new membership actor with code = '{code}'.");
}
else
{
    await starter.RaiseEventAsync(code, "operation", "refresh");
    log.Info($"Refreshed an existing membership actor with code = '{code}'.");
}
```

## When do actors get terminated?

They can be easily terminated using the `TerminateAsync` API. So I created a little HTTP trugger that would terminate instances:

```
[FunctionName("HttpTerminateMemberships")]
public static async Task<HttpResponseMessage> Run(
    [HttpTrigger(AuthorizationLevel.Function, methods: "post", Route = "memberships/terminate/{code}")] HttpRequestMessage req,
    [OrchestrationClient] DurableOrchestrationClient starter,
    string code,
    TraceWriter log)
{
    try
    {
        await starter.TerminateAsync(code, "");
        return req.CreateResponse<dynamic>(HttpStatusCode.OK);
    }
    catch (Exception ex)
    {
        return req.CreateResponse<dynamic>(HttpStatusCode.BadRequest, ex.Message);
    }
}
```

The Azure Durable Functions maintain a state of all running instances in a task hub which is basically a storage resource with control queues, qork-item queues, a history table and lease blobs. You can read more about this [here](https://docs.microsoft.com/en-us/azure/azure-functions/durable-functions-task-hubs). 

Effectively, the `host.json` `durableTask` indicate the hub name:

```
"durableTask": {
    "HubName": "TestDurableFunctionsHub"
  }
``` 

The run-time environment stores related information about running instances in storage keyed by the hub name.  

## The actor state

Each actor has an internal state! It is initially read by the singleton as an input:

```
dynamic membership = context.GetInput<dynamic>();
```

and it is updated using:

```
context.ContinueAsNew(membership);
```

But it seems that the internal state is actually not persisted anywhere ...it is transient. When actors are initially created, a state is passed as an input i.e. `context.GetInput<dynamic>()` and the actor updates it with a call to `ContinueAsNew` which actually restarts itself with a new state. 

The internal state can be read by using one of the APIs of the instance management:

```
var status = await client.GetStatusAsync(instanceId);
```

Where `client` is `DurableOrchestrationClient`. The status input is the actor's internal state:

```
{
    "Name": "E3_MembershipWithTimer",
    "InstanceId": "U7CCR",
    "CreatedTime": "2017-12-29T21:12:24.8229285Z",
    "LastUpdatedTime": "2017-12-29T21:12:25.5309613Z",
    "Input": {
        "$type": "<>f__AnonymousType0`3[[System.String, mscorlib],[System.String, mscorlib],[System.String, mscorlib]], VSSample",
        "Id": "asas",
        "Code": "U7CCR",
        "CardNumber": "977515900121213"
    },
    "Output": null,
    "RuntimeStatus": 0
}
``` 

I am not sure if the actor internal state is meant to hold big state though. Perhaps it is better if the actor exposes its state externally so HTTP triggers, for example, can read it directly from the external store. 

One way of doing this is to modify the code to look something like this:

```
[FunctionName("HttpRefreshMemberships")]
public static async Task<HttpResponseMessage> Run(
    [HttpTrigger(AuthorizationLevel.Function, methods: "post", Route = "memberships/refresh/{code}")] HttpRequestMessage req,
    [OrchestrationClient] DurableOrchestrationClient starter,
    string code,
    TraceWriter log)
{
    var membershipStatus = await starter.GetStatusAsync(code);
    string runningStatus = membershipStatus == null ? "NULL" : membershipStatus.RuntimeStatus.ToString();
    log.Info($"Instance running status: '{runningStatus}'.");

    if (
        membershipStatus == null || 
        membershipStatus.RuntimeStatus != OrchestrationRuntimeStatus.Running
        )
    {
		// Given the membership code, read from an external source
        var membership = await RetriveFromCosmosDB(code);
        await starter.StartNewAsync("E3_Membership", code, membership);
        log.Info($"Started a new membership actor with code = '{code}'.");
    }
    else
    {
        await starter.RaiseEventAsync(code, "operation", "refresh");
        log.Info($"Refreshed an existing membership actor with code = '{code}'.");
    }

    var res = starter.CreateCheckStatusResponse(req, code);
    res.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(10));
    return res;
}
```

and the membership actor:

```
public static class Membership
{
    [FunctionName("E3_Membership")]
    public static async Task<dynamic> Run(
        [OrchestrationTrigger] DurableOrchestrationContext context,
        TraceWriter log)
    {
        dynamic membership = context.GetInput<dynamic>();
        if (membership == null)
		{
            // Read from an external source 
            membership = await RetriveFromCosmosDB(context.InstanceId);
		}

        var operation = await context.WaitForExternalEvent<string>("operation");
        log.Info($"***** received '{operation}' event.");

        operation = operation?.ToLowerInvariant();
        if (operation == "refresh")
        {
            membership = await Refresh(context, log);
        }

        if (operation != "end")
        {
            context.ContinueAsNew(membership);
        }

        return membership;
    }

    public static async Task<dynamic> Refresh(DurableOrchestrationContext context,
                                              TraceWriter log)
    {
        // TODO: Do something to refresh the membership
        dynamic membership = new {
            Id = "asas",
            Code = context.InstanceId,
            CardNumber = "977515900121213"
        };

		// TODO: Store to an external source
        await StoreToCosmosDB(context.InstanceId, membership);

        DateTime now = DateTime.Now;
        string formatDate = now.ToString("MM/dd/yyyy hh:mm:ss.fff tt");
        log.Info($"**** done refreshing '{context.InstanceId}' @ {formatDate}");
        return membership;
    }
}
```

and the HTTP trigger that retrieves the membership actor state from an extenal source without dealing with the actor:

```
[FunctionName("HttpGetMembership")]
public static async Task<HttpResponseMessage> Run(
    [HttpTrigger(AuthorizationLevel.Function, methods: "get", Route = "memberships/{code}")] HttpRequestMessage req,
    [OrchestrationClient] DurableOrchestrationClient starter,
    string code,
    TraceWriter log)
{
    var status = await starter.GetStatusAsync(code);
    if (status != null)
    {
        return req.CreateResponse<dynamic>(HttpStatusCode.OK, await RetriveFromCosmosDB(code));
    }
    else
    {
        return req.CreateResponse<dynamic>(HttpStatusCode.BadRequest, $"{code} membership actor is not found!");
    }
}
```

So unlike regular actor implementation, Azure Functions singletons do not expose any method to be called from the outside! The platform only allows starting/creating, querying and terminating instances. 

## Comments & Anamolies

### .NET Core and .NET Standard 2.0

It is work in progress! It is best to use the .NET full framework with Azure Durable Functions. Hopefully this will change soon and we will be able to use .NET Core reliably.

### Local Debugging

I had a very hard time with this. The symptoms that I experienced are unfortutanely not experienced by other developers who tried this as I could not see similar reported issues. I am using Vs2017 and Azure Functions Extension ...the latest at the time of writing DEC/2017. 

Here are my comments:

- If you want to debug locally, make sure you set both the local.setting.json and host.json file to `copy always`. You do this from the properties window.
- On both of my developer machines, I hit F5, it prompts me to install the Azure Functions Core tools and things look quite good. I was able to run locally.
- But then subsequent F5, I get very different results ranging from:
    - The CLI starts and exits on its own ...I could not find out what the reason is
    - The CLI starts and displays the functions URls. But it also complains about some files were changed and the host needs to restart. The URls are not responsive and there is nothing you can do except to terminate and restart.
    - The CLI statrs and actually works.....does not happen often ...but I have seen it work
    - F5 mostly causes the CLI to start and exit. Control-F5 does not exit ...but the function URLs are not accessible due to this `change detected` message.
- Effectively, local debugging did not work for me at all. It was a very frustrating experience. So I had to deploy everything (see deplyment below) to Azure and debug there....another frustrating experience. 

### Deployment

- The only effective way I was able to find out how to deploy a Durable Functions App is via Visual Studio. I have heard some people got it to work with VSTS. But, given that this is a test run, I did not really explore this option.
- However, if you just click the `publish` button in VS, it will auto-create a storage account for you which names things really weird. My recommendation is to create the App Service, Service Plan, Storage and App Insights in portal or via Azure CLI and then use Visual Studio to publish into it. 
- If you renamed a function and re-deployed, Visual Studio will publish the new functions app with the new function. But the old function will still be there (you can see it from the portal). You can then use `Kudo`, navigate to the directory and actually delete the old function folder. 
- The local.settings.json entries are not deployed to Azure! This means you have to manually create them in the portal app settings or in Visual Studio deployment window. 

### Storage

As mentioned, an Azure Storage is required to maintain teh durable instances. They are keyed off the hub name you specify in the host. There are entries in blob, tables, files and queues. 

### Logging

Unless you turn on streaming on a function in the portal, you don't get anything (or at least, I could not find a way to do it). But watching the log from the portal is very difficult as it times out and it is not very user friendly. This is one area that requires better UX in the portal. The logs are also stored on the app's file system which you can access from `Kudo`. However, I noticed that, unless you request stream logging on a function, these files are not created. 

So the story of logging is a little frustrating at best! I had to use App Insights trace to see what is going on.

### Timers
 
As mentioned above, it is very important that we leverage the context to provide accurate timer information as opposed to `TimeSpan` and `DateTime.Now`, etc. Initially I used `TimeSpan.FromMinutes(30)` to wait for 30 minutes....but the way to do it is to always use the `context` such as `DateTime deadline = context.CurrentUtcDateTime.AddMinutes(30);`. After doing that, I started getting conistent timeout periods and things worked normally. 

### Instance Termination

Although `TerminateAsync` on an instance works, I am not exactly sure if it works the way it is supposed to:

- If I have a running instance and that instance is actually waiting on an external or time out event, `TerminateAsync` does not do anything. I guess because a message is enqueued to the instance but the instance is waiting on other events ....so it did not get the `terminate` signal yet.
- If the instance is not waiting on anything, `TerminateAsync` replays the instance which runs code that you don't necessarily want to run. For example, I had an instance that triggers a logic app once it receives an `end` operation which works. However, if I terminate the instance using `TerminateAync`, the code triggers the logic app again because it was replayed! 

Not sure if this behavior is correct and what the `terminate` signal actually do.       

## Conclusion

Reflecting on the little time that I spent with Azure Durable Functions, I think they will play an important part of my future solutions. I think they have what it takes to use as actors especially that the Azure Durable Functions are designed to [support 1000's of instances](https://social.msdn.microsoft.com/Forums/en-US/b6ffeae3-f62a-4e6d-a68a-e5dc6f9ffd62/durable-singletons?forum=AzureFunctions) . If we externalize the actor's state, we will be able to query the external store as opposed to query the actors themselves to retrieve their state. 

Azure Durable Actors can also employ reminders and other sophisticated techniques found in Service Fabric actors such as long-running, stateful, single-threaded, location-transparent and globally addressable (taken from the overview [documentation page](https://docs.microsoft.com/en-us/azure/azure-functions/durable-functions-overview)). However, as stated above and unlike other actor implementations, Azure Functions singletons do not expose methods that can be called from the outside. 

In any case, the Azure Durable Functions are still in preview. So we can expect many great features to be added soon.  


 





