---
title:  Service Fabric Fundamentals
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Service Fabric]
---

The [Service Fabric iOT sample app](https://github.com/Azure-Samples/service-fabric-dotnet-iot) is a great sample to follow for our own Service Fabric apps. In this post, I used code snippets and concepts from the iOT sample to build a small app to demonstrate some fundamentals concepts that I feel are important.

The source code for this post is available [here](https://github.com/khaledhikmat/service-fabric-fundamentals).

## The app scenario

The app is called Rate Aggregator where we have an app that monitors hotel rate requests coming in from somewhere (presumably from some site) and aggregates the result by city. I also wanted the app to be multi-tenant so we can have an app instance for each rate service provider i.e. Contoso and Fabrican. 

The app is quite simple and consists of two services: Web Service to act as a front-end and a rates service to actually process the rates and aggregate them:

![App Components](http://i.imgur.com/trNQnSS.png)

## Source Code

The solution source code consists of 4 different projects:

- Common Project - a class library that has the common classes that are shared across the other projects. Please note that this library must be built using the `x64` platform.
- Web Service - a stateless Service Fabric service created using the Visual Studio ASP.NET Core template.
- Rates Service - a stateful Service Fabric service created using the Visual Studio ASP.NET Core template.
- An app project to contain the Service Fabric instances and provide application manifests.
- A collection of PowerShell scripts that manage the deployment, un-deployment, update, upgrade and test. We will go through those files in this post.

Please note:

- I created the solution using VS 2015 Service Fabric template. But actually the projects are regular projects that include Service Fabric NuGet packages. The only project that is quite specific to Service Fabric is the app project i.e. `RateAggregatorApp` ...but as demonstrated in a [previous post](/blog/2016/12/02/service-fabric-basics), the app manifests and packaging can be easily generated manually.
- The ASP.NET Code template in Service Fabric is still in preview. I noticed some odd stuff about it:
	- The template assumes that you are building stateless services! To create Stateful services using the ASP.NET template, manual intervention have to take place which I will note in this post
	-  The useful `ServiceEventSource.cs` class is not included in the generated project. So if you want to use ETW logging, you must create this file manually (copy it from another SF project)
	-  The template includes, in the `Program.cs` file the Service Fabric registration code and the Service class. It is useful to break up apart and create a class (using the name of the service) to describe the service i.e. `WebService` and `RatesService`
-  The Service Fabric `RateAggregatorApp` `APplicationManifest.xml` file has a section for `DefaultServices` which automatically deploys the default services whenever an app is deployed. I usually remove the default services from the manifest file so i can better control the named app instance and service creation process (which I will demo in this post).

## Fundamental Concepts

The [iOT](https://github.com/Azure-Samples/service-fabric-dotnet-iot) sample includes really nice code utilities that can be used to build `Uri`s for services especially when the service exposes HTTP endpoints. The most important concepts that I would like to convey are:

### HTTP Endpoints 

If you would like to expose HTTP Endpoints for your service, Microsoft strongly recommends that you build the URL as follows:

![HTTP Endpoint URL](http://i.imgur.com/qQdvX9h.png)

Examples:

1. `Http://localhost:8084/ContosoRateAggregatorApp/7217642a-2ac8-4b29-b52d-3e92303ce1b2/131262989332452689/f74f07f7-d92f-47b9-8d6b-c86966c78d09`
2. `Http://localhost:8084/FabricanRateAggregatorApp/13049e47-9727-4e02-9086-8fd6e2457313/131262989924122573/3b3455d8-487e-4ec4-9bd8-64ba8e658662`

For stateful services, this makes total sense! The combination of `partitionId` and `instanceId` are great for diagnostics and the `guid` makes every endpoint unique which is really useful because services are sometimes moved around. However, for Stateless services, I think we can easily omit the `partitionId`, the `instanceId` and the `guid` since stateless service endpoints are usually load balanced as they accept traffic from the Internet. Examples of stateless services endpoints:

1. `Http://localhost:8082/FabricanRateAggregatorApp`
2. `Http://localhost:8082/ContosoRateAggregatorApp`

If you are planning to expose multiple stateless web services in each app instances, then perhaps adding the service name to the end of the URL would make sense.Examples:

1. `Http://localhost:8082/FabricanRateAggregatorApp/WebService`
2. `Http://localhost:8082/ContosoRateAggregatorApp/WebService`

The demo app source code common project includes a `WebHostCommunicationListener` class (which is borrowed from the iOT sample) shows a really good implementation of how to manage this:

```csharp
string ip = this.serviceContext.NodeContext.IPAddressOrFQDN;
EndpointResourceDescription serviceEndpoint = this.serviceContext.CodePackageActivationContext.GetEndpoint(this.endpointName);
EndpointProtocol protocol = serviceEndpoint.Protocol;
int port = serviceEndpoint.Port;
string host = "+";

string listenUrl;
string path = this.appPath != null ? this.appPath.TrimEnd('/') + "/" : "";

if (this.serviceContext is StatefulServiceContext)
{
    StatefulServiceContext statefulContext = this.serviceContext as StatefulServiceContext;
    listenUrl = $"{serviceEndpoint.Protocol}://{host}:{serviceEndpoint.Port}/{path}{statefulContext.PartitionId}/{statefulContext.ReplicaId}/{Guid.NewGuid()}";
}
else
{
    listenUrl = $"{serviceEndpoint.Protocol}://{host}:{serviceEndpoint.Port}/{path}";
}

this.webHost = this.build(listenUrl);
this.webHost.Start();

return Task.FromResult(listenUrl.Replace("://+", "://" + ip));
```

### HTTP Web APIs

Using ASP.NET Core to implement the Stateless and Stateful services has the distinct advantage of allowing the services expose a Web API layer that can be used by clients to call on the services. The Web API layer has regular controllers with normal Web API decoration to allow the services be called from regular HTTP clients:

```csharp
    [Route("api/[controller]")]
    public class RatesController : Controller
    {
        private readonly IReliableStateManager stateManager;
        private readonly StatefulServiceContext context;
        private readonly CancellationTokenSource serviceCancellationSource;

        public RatesController(IReliableStateManager stateManager, StatefulServiceContext context, CancellationTokenSource serviceCancellationSource)
        {
            this.stateManager = stateManager;
            this.context = context;
            this.serviceCancellationSource = serviceCancellationSource;
        }

        [HttpGet]
        [Route("queue/length")]
        public async Task<IActionResult> GetQueueLengthAsync()
        {
			....
		}
	}
```

Please note that the service has the `IReliableStateManager`, the `StatefulServiceContext` and the `CancellationSource` injected. This allows the Web API controller to use the service reliable collections and anything else related to service context. For example, this is the implementation of the queue length Web API method:

```csharp
        [HttpGet]
        [Route("queue/length")]
        public async Task<IActionResult> GetQueueLengthAsync()
        {
            IReliableQueue<RateRequest> queue = await this.stateManager.GetOrAddAsync<IReliableQueue<RateRequest>>(RatesService.RateQueueName);

            using (ITransaction tx = this.stateManager.CreateTransaction())
            {
                long count = await queue.GetCountAsync(tx);

                return this.Ok(count);
            }
        }
```

Note how the API controller uses the injected `StateManager` to gain access to the reliable queue and reports on its length.

Since the service interface is implemented as regular Web API controllers (or controllers), they can also be exposed as `Swagger` and allow other an API management layer to front-end these services.  

To make this possible, the service must override the `CreateServiceInstanceListeners` in case of stateless services and `CreateServiceReplicaListeners` in case of stateful services. Here is an example of the Stateful service:

```csharp
protected override IEnumerable<ServiceReplicaListener> CreateServiceReplicaListeners()
{
    return new ServiceReplicaListener[1]
    {
        new ServiceReplicaListener(
            context =>
            {
                string tenantName = new Uri(context.CodePackageActivationContext.ApplicationName).Segments.Last();

                return new WebHostCommunicationListener(
                    context,
                    tenantName,
                    "ServiceEndpoint",
                    uri =>
                    {
                        ServiceEventSource.Current.Message($"Listening on {uri}");

                        return new WebHostBuilder().UseWebListener()
                            .ConfigureServices(
                                services => services
                                    .AddSingleton<StatefulServiceContext>(this.Context)
                                    .AddSingleton<IReliableStateManager>(this.StateManager)
                                    .AddSingleton<CancellationTokenSource>(this._webApiCancellationSource))
                            .UseContentRoot(Directory.GetCurrentDirectory())
                            .UseStartup<Startup>()
                            .UseUrls(uri)
                            .Build();
                    });
            })
    };
}

```

Please note the use of the `WebHostCommunicationListener` and how we inject the service context, state manager and the cancellation token.

In our demo app, both statelss and stateful services implement their interface as Web API.

### HTTP vs. RCP Endpoints

Instead of HTTP Web API, Services (especially stateful) can expose an interface using a built-in RCP communicaton listener. In this case, the service implements an interface and make it easy for clients to call upon the service using the interface. For example, a stateful service might have an interface that looks like this:

```csharp
    public interface ILookupService : IService
    {
        Task EnqueueEvent(SalesEvent sEvent);
        Task<string> GetNodeName();
        Task<int> GetEventsCounter(CancellationToken ct);
    }
```

The service will then be implemented this way:

```csharp
    internal sealed class LookupService : StatefulService, ILookupService
    {
	...
	}
```

The service will override the CreateServiceReplicaListeners as follows:

```csharp
    protected override IEnumerable<ServiceReplicaListener> CreateServiceReplicaListeners()
    {
        return new[]
            {
                new ServiceReplicaListener(context =>
                    this.CreateServiceRemotingListener(context),
                    "rpcPrimaryEndpoint",
                    false)
            };
    }
```

Although this looks nice and complies with Object Oriented programming, I think it should only be used with internal stateful services (those that do not expose an outside interface). Stateless services that are used by external clients are better off using an HTTP Web API interface which makes them easily consumable by many clients in different languages. 

### Reliable Collections

Since we have the state manager injected in the stateful service Web API controllers, it makes all the service reliable collections available to the Web API controllers. In our demo, the `RatesService` Web API controller i.e. `RatesController` uses the reliable queue to get the queue length and enqueue rate requests to the service. The service processes the incoming `RateRequest` in its `RunAsyc` method and aggregates the results in a reliable dictionary indexed by city/country:

```csharp
protected override async Task RunAsync(CancellationToken cancellationToken)
{
    cancellationToken.Register(() => this._webApiCancellationSource.Cancel());

    IReliableDictionary<string, RateAggregation> citiesDictionary = await this.StateManager.GetOrAddAsync<IReliableDictionary<string, RateAggregation>>(RateCitiesDictionaryName);
    IReliableQueue<RateRequest> queue = await this.StateManager.GetOrAddAsync<IReliableQueue<RateRequest>>(RateQueueName);

    while (true)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            using (var tx = this.StateManager.CreateTransaction())
            {
                var result = await queue.TryDequeueAsync(tx);

                if (result.HasValue)
                {
                    RateRequest request = result.Value;

                    // TODO: Process the request
                    // TODO: Go against the reservation provider to pick up the rate
                    // TODO: How do I determine the reservation provider per tenant?
                    int nights = (request.CheckOutDate - request.CheckInDate).Days;
                    int netAmount = _random.Next(500) * nights;
                    var newAggregation = new RateAggregation();
                    newAggregation.Transactions = 1;
                    newAggregation.Nights = nights;
                    newAggregation.Amount = (double) netAmount;

                    await citiesDictionary.AddOrUpdateAsync(tx, $"{request.City}/{request.Country}", newAggregation, (key, currentValue) =>
                    {
                        currentValue.Transactions += newAggregation.Transactions;
                        currentValue.Nights += newAggregation.Nights;
                        currentValue.Amount += newAggregation.Amount;
                        return currentValue;
                    });

                    // This commits the add to dictionary and the dequeue operation.
                    await tx.CommitAsync();
                }
            }
        }
        catch (Exception e)
        {

        }

        await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
    }
}
```

The reliable dictionary is then used in the service contrloller to return the aggregated result in an API call. 

### Partitions, Replicas and Instances

In our demo app, we use partitions in the Stateful service i.e. `RatesService` to partition our data in 4 different buckets: 

1. Rate Requests for the United States
2. Rate Requests for Canada
3. Rate Requests for Australia
4. Rate Requests for other countries

Hence our partition key range is 0 (Low Key) to 3 (High Key). We use a very simple method to select the appropriate partition based on the request's country code:

```csharp
private long GetPartitionKey(RateRequest request)
{
    if (request.Country == "USA")
        return 0;
    else if (request.Country == "CAN")
        return 1;
    else if (request.Country == "AUS")
        return 2;
    else // all others
        return 3;
}
```

To allow for high availability, Service Fabric uses replicas for stateful services and instances for stateless services. In Service Fabric literature, the term replicas and instances are often exchanged. 

In order to guarantee high availability of stateful service state, the state for each partition is usually replicated. The number of replicas is decided at the time of deploying the service (as we will see soon in the PowerShell script). This means that, if a stateful service has 4 partitions and the target replica count is 3, for example, then there are 12 instances of that service in Service Fabric.    

In order to guarantee high availability of stateless services, Service Fabric allows the instantiation of multiple instances. Usually the number of instances matches the number of nodes in the Service Fabric cluster which allows Service Fabric to distribute an instance on each node. The load balancer then distribute the load across all nodes. 

Please note, however, that, unlike stateless service instances, a stateful service partitions cannot be changed at run-time once the service is deployed. The number of partitions must be decided initially before the service is deployed to the cluster. Of course, if the service state can be discarded, then of course changes to the partition are allowed. Stateless services number of instances can be updated at any time (up or down) at any time. In fact, this is one of the great features of Service Fabric.

### Result Aggregation

Since the state is partitioned, does this mean that we have the reliable collections (i.e. queues and dictionaries) scattered among the different partitions? The answer is yes! For example, in order to get the queue length of a stateful service, the client has to query all partitions and ask each service instance about the queue length and add them together to determine the overall queue length for the stateful service:

```csharp
[HttpGet]
[Route("queue/length")]
public async Task<IActionResult> GetQueueLengthAsync()
{
    ServiceUriBuilder uriBuilder = new ServiceUriBuilder(RatesServiceName);
    Uri serviceUri = uriBuilder.Build();

    // service may be partitioned.
    // this will aggregate the queue lengths from each partition
    ServicePartitionList partitions = await this.fabricClient.QueryManager.GetPartitionListAsync(serviceUri);

    HttpClient httpClient = new HttpClient(new HttpServiceClientHandler());

    long count = 0;
    foreach (Partition partition in partitions)
    {
        Uri getUrl = new HttpServiceUriBuilder()
            .SetServiceName(serviceUri)
            .SetPartitionKey(((Int64RangePartitionInformation)partition.PartitionInformation).LowKey)
            .SetServicePathAndQuery($"/api/rates/queue/length")
            .Build();

        HttpResponseMessage response = await httpClient.GetAsync(getUrl, this.cancellationSource.Token);

        if (response.StatusCode != System.Net.HttpStatusCode.OK)
        {
            return this.StatusCode((int)response.StatusCode);
        }

        string result = await response.Content.ReadAsStringAsync();

        count += Int64.Parse(result);
    }

    return this.Ok(count);
}
```

`FabricClient` is the .NET client used to provide all sorts of management capabilities. It is injected in the Web Service controller to allow them to communicate with each partitition replica and get the needed results as shown above. Then the Web Service adds the count of each partition and return the total lenth of all partitions queues. 

Similarly, the Web Service uses the `FabricClient` to communicate with the each partition replica to get and aggregate the result of each country cities:

```csharp        
[HttpGet]
[Route("cities")]
public async Task<IActionResult> GetCitiesAsync()
{
    ServiceUriBuilder uriBuilder = new ServiceUriBuilder(RatesServiceName);
    Uri serviceUri = uriBuilder.Build();

    // service may be partitioned.
    // this will aggregate cities from all partitions
    ServicePartitionList partitions = await this.fabricClient.QueryManager.GetPartitionListAsync(serviceUri);

    HttpClient httpClient = new HttpClient(new HttpServiceClientHandler());

    List<CityStats> cities = new List<CityStats>();
    foreach (Partition partition in partitions)
    {
        Uri getUrl = new HttpServiceUriBuilder()
            .SetServiceName(serviceUri)
            .SetPartitionKey(((Int64RangePartitionInformation)partition.PartitionInformation).LowKey)
            .SetServicePathAndQuery($"/api/rates/cities")
            .Build();

        HttpResponseMessage response = await httpClient.GetAsync(getUrl, this.cancellationSource.Token);

        if (response.StatusCode != System.Net.HttpStatusCode.OK)
        {
            return this.StatusCode((int)response.StatusCode);
        }

        JsonSerializer serializer = new JsonSerializer();
        using (StreamReader streamReader = new StreamReader(await response.Content.ReadAsStreamAsync()))
        {
            using (JsonTextReader jsonReader = new JsonTextReader(streamReader))
            {
                List<CityStats> result = serializer.Deserialize<List<CityStats>>(jsonReader);

                if (result != null)
                {
                    cities.AddRange(result);
                }
            }
        }
    }

    return this.Ok(cities);
}

```

### Multi-Tenancy

One of the great features of Service Fabric is its ability to allow the creation of multi-tenant scanarios. In our demo case, we may launch an app for Contoso rates and another one for Fabrican rates. We want these two apps to be of the same type but they should be completely isolated of each other. So we create two named app instances: `ConosoRateAggretor` and `FabricanRateAggregator`. This means that we have different set of services for each app operated independely and perhaps scaled, updated and upgraded independently.

![Named App Instances](http://i.imgur.com/e6YmFNy.png) 

This is really useful in many scenarios and allows for many great advantages. In the next section, we will see how easy it is to actually deploy, un-deploy, update and upgrade these named instances.
 
### Configuration

Given that we have multiple named app instances, how do we pass different parameters for each named instance? In the `RatesService`, we would like to have the name of the provider (and probably other configuration items) so we can communicate with the provider to pull rates. In our demo app, we are not actually communicating with the provider.

To do this, we define parameters for the `RatesService` in the Service Settings file as follows:

```
<?xml version="1.0" encoding="utf-8" ?>
<Settings xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.microsoft.com/2011/01/fabric">
  <!-- Add your custom configuration sections and parameters here -->
  <Section Name="ParametersSection">
    <Parameter Name="ProviderName" Value="" />
  </Section>
</Settings>
```

The section name can be anything. In our case, it is `ParametersSection`. To be able to override this value for a specific application instance, we create a `ConfigOverride` when we import the service manifest in the application manifest:

```
<ServiceManifestImport>
<ServiceManifestRef ServiceManifestName="RatesServicePkg" ServiceManifestVersion="1.0.0" />
<ConfigOverrides>
  <ConfigOverride Name="Config">
    <Settings>
      <Section Name="ParametersSection">
        <Parameter Name="ProviderName" Value="[RatesService_ProviderName]" />
      </Section>
    </Settings>
  </ConfigOverride>
</ConfigOverrides>
</ServiceManifestImport>
```

*The convention is to name the value as `ServiceName_ParameterName`*

Finally, we must adjust the application manifest to include the required parameter:

```
<ApplicationManifest xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ApplicationTypeName="RateAggregatorAppType" ApplicationTypeVersion="1.0.0" xmlns="http://schemas.microsoft.com/2011/01/fabric">
  <Parameters>
    <Parameter Name="RatesService_ProviderName" DefaultValue="" />
  </Parameters>
  ...
</ApplicationManifest>
```

Finally, at the deployment time (as you will see in more detail in the deployment script), we will specify a PowerShell `Hashtable` to override these parameters per named instance:

```
New-ServiceFabricApplication -ApplicationTypeName $appTypeName -ApplicationTypeVersion $version -ApplicationName $appName -ApplicationParameter @{"RatesService_ProviderName" = "Contoso"}  

New-ServiceFabricApplication -ApplicationTypeName $appTypeName -ApplicationTypeVersion $version -ApplicationName $appName -ApplicationParameter @{"RatesService_ProviderName" = "Fabrican"}  
```

The `RatesService` code will then make sure of this parameter to contact the instance-bound provider.

## PowerShell Management Scripts
    
### Deployment

**This PowerShell script assumes that you used Visual Studio to generate the Service Fabric app package info (right-click the Service Fabric App and select `Package`) or you built the app package manually as demonstrated in a previous [post](/blog/2016/12/02/service-fabric-basics). The created package directory is expected to have the following format `v1.0.0` where 1.0.0 is the version number**

This PowerShell script copies the package to the cluster, registers the app type and creates two name app instances (i.e. Contoso and Fabrican). In each app instance, create two services: Web Service as a front-end and Rates service as a back-end. 

```
$clusterUrl = "localhost"
$imageStoreConnectionString = "file:C:\SfDevCluster\Data\ImageStoreShare"   # Use this with OneBox
If ($clusterUrl -ne "localhost")
{
    $imageStoreConnectionString = "fabric:ImageStore"                       # Use this when not using OneBox
}

# Used only for the inmage store....it can be any name!!!
$appPkgName = "RateAggregatorAppTypePkg"

# Define the app and service types
$appTypeName = "RateAggregatorAppType"
$webServiceTypeName = "WebServiceType"
$ratesServiceTypeName = "RatesServiceType"

# Define the version
$version = "1.0.0"

# Connect PowerShell session to a cluster
Connect-ServiceFabricCluster -ConnectionEndpoint ${clusterUrl}:19000

# Copy the application package to the cluster
Copy-ServiceFabricApplicationPackage -ApplicationPackagePath "RateAggregatorApp\pkg\v$version" -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Register the application package's application type/version
Register-ServiceFabricApplicationType -ApplicationPathInImageStore $appPkgName

# After registering the package's app type/version, you can remove the package
Remove-ServiceFabricApplicationPackage -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Deploy the first aplication name (i.e. Contoso)
$appName = "fabric:/ContosoRateAggregatorApp"
$webServiceName = $appName + "/WebService"
$ratesServiceName = $appName + "/RatesService"

# Create a named application from the registered app type/version
New-ServiceFabricApplication -ApplicationTypeName $appTypeName -ApplicationTypeVersion $version -ApplicationName $appName -ApplicationParameter @{"RatesService_ProviderName" = "Contoso"}  

# Create a named service within the named app from the service's type
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $webServiceTypeName -ServiceName $webServiceName -Stateless -PartitionSchemeSingleton -InstanceCount 1

# Create a named service within the named app from the service's type
# For stateful services, it is important to indicate in the service manifest that the service is stateful and that it has a persisted state:
# <StatefulServiceType ServiceTypeName="RatesServiceType" HasPersistedState="true"/>
# Actually all of these switches are important on the PowerShell command:
# -PartitionSchemeUniformInt64 $true -PartitionCount 4 -MinReplicaSetSize 2 -TargetReplicaSetSize 3 -LowKey 0 -HighKey 3 -HasPersistedState
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $ratesServiceTypeName -ServiceName $ratesServiceName -PartitionSchemeUniformInt64 $true -PartitionCount 4 -MinReplicaSetSize 2 -TargetReplicaSetSize 3 -LowKey 0 -HighKey 3 -HasPersistedState

# Deploy the second aplication name (i.e. Fabrican)
$appName = "fabric:/FabricanRateAggregatorApp"
$webServiceName = $appName + "/WebService"
$ratesServiceName = $appName + "/RatesService"

# Create a named application from the registered app type/version
New-ServiceFabricApplication -ApplicationTypeName $appTypeName -ApplicationTypeVersion $version -ApplicationName $appName -ApplicationParameter @{"RatesService_ProviderName" = "Fabrican"}  

# Create a named service within the named app from the service's type
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $webServiceTypeName -ServiceName $webServiceName -Stateless -PartitionSchemeSingleton -InstanceCount 1

# Create a named service within the named app from the service's type
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $ratesServiceTypeName -ServiceName $ratesServiceName -PartitionSchemeUniformInt64 $true -PartitionCount 4 -MinReplicaSetSize 2 -TargetReplicaSetSize 3 -LowKey 0 -HighKey 3 -HasPersistedState
```

### Obliterate

This PowerShell script removes all application name instances and their services from the selected cluster. It does this based on the application type.

```
$clusterUrl = "localhost"

# Define the app and service types
$applicationTypes = "RateAggregatorAppType"

# Connect PowerShell session to a cluster
Connect-ServiceFabricCluster -ConnectionEndpoint ${clusterUrl}:19000

# Remove all application names instances and their services
Get-ServiceFabricApplication | Where-Object { $applicationTypes -contains $_.ApplicationTypeName } | Remove-ServiceFabricApplication -Force
Get-ServiceFabricApplicationType | Where-Object { $applicationTypes -contains $_.ApplicationTypeName } | Unregister-ServiceFabricApplicationType -Force

```

### Update

This PowerShell script updates the web service in each app named instance to have 5 instances. Please note that this works if the number of instances does  not exceed the number of nodes in the cluster.

```
$clusterUrl = "localhost"

# Deploy the first aplication name (i.e. Contoso)
$appName = "fabric:/ContosoRateAggregatorApp"
$webServiceName = $appName + "/WebService"

# Dynamically change the named service's number of instances (the cluster must have at least 5 nodes)
Update-ServiceFabricService -ServiceName $webServiceName -Stateless -InstanceCount 5 -Force

# Deploy the first aplication name (i.e. Fabrican)
$appName = "fabric:/FabricanRateAggregatorApp"
$webServiceName = $appName + "/WebService"

# Dynamically change the named service's number of instances (the cluster must have at least 5 nodes) 
Update-ServiceFabricService -ServiceName $webServiceName -Stateless -InstanceCount 5 -Force
```

### Upgrade

This PowerShell script upgrades the application named instances to a higher version i.e. 1.1.0. As noted earlier, this assumes that you have a new folder named v1.1.0 which contains the upgraded application package. The script uses `monitored` upgrade modes and performs the upgrade using upgrade domains. 

```
$clusterUrl = "localhost"
$imageStoreConnectionString = "file:C:\SfDevCluster\Data\ImageStoreShare"   # Use this with OneBox
If ($clusterUrl -ne "localhost")
{
    $imageStoreConnectionString = "fabric:ImageStore"                       # Use this when not using OneBox
}

# Used only for the inmage store....it can be any name!!!
$appPkgName = "RateAggregatorAppTypePkg"

# Define the new version
$version = "1.1.0"

# Connect PowerShell session to a cluster
Connect-ServiceFabricCluster -ConnectionEndpoint ${clusterUrl}:19000

# Copy the application package to the cluster
Copy-ServiceFabricApplicationPackage -ApplicationPackagePath "RateAggregatorApp\pkg\v$version" -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Register the application package's application type/version
Register-ServiceFabricApplicationType -ApplicationPathInImageStore $appPkgName

# After registering the package's app type/version, you can remove the package
Remove-ServiceFabricApplicationPackage -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Upgrade the first aplication name (i.e. Contoso)
$appName = "fabric:/ContosoRateAggregatorApp"

# Upgrade the application to the new version
Start-ServiceFabricApplicationUpgrade -ApplicationName $appName -ApplicationTypeVersion $version -Monitored -UpgradeReplicaSetCheckTimeoutSec 100

# Upgrade the second aplication name (i.e. Fabrican)
$appName = "fabric:/FabricanRateAggregatorApp"

# Upgrade the application to the new version
Start-ServiceFabricApplicationUpgrade -ApplicationName $appName -ApplicationTypeVersion $version -Monitored -UpgradeReplicaSetCheckTimeoutSec 100

```

### Test

This PowerShell scripts defines functions to exercise the Service Fabric Web service APIs for each named application instance.
 
```
Function Generate-RateRequests($appName = 'Contoso', $iterations = 20)
{
    Try {
        Write-Host "Generating $iterations random rate requests against $appName ...." -ForegroundColor Green

        $url = "Http://localhost:8082/$appName" + "RateAggregatorApp/api/requests"

        foreach($i in 1..$iterations)
        {
            $checkInDate = get-date -Year (get-random -minimum 2012 -maximum 2016) -Month (get-random -minimum 1 -maximum 12) -Day (get-random -minimum 1 -maximum 28)
            $nights = get-random -minimum 1 -maximum 30
            $checkOutDate = $checkInDate.AddDays($nights)
            $hotelId = get-random -input "1", "2", "3" -count 1
            $body = @{
                CheckInDate = get-date $checkInDate -Format "yyy-MM-ddTHH:mm:ss";
                CheckOutDate = get-date $checkOutDate -Format "yyy-MM-ddTHH:mm:ss";
                HotelId = $hotelId;
                HotelName = "Hotel$hotelId";
                City = "City$hotelId";
                Country = get-random -input "USA", "USA", "USA", "CAN", "CAN", "CAN", "AUS", "AUS", "AUS", "FRA", "GER", "UAE" -count 1
            }
            Write-Host "This is the JSON we are generating for iteration # $i...." -ForegroundColor yellow
            $json = ConvertTo-Json $body -Depth 3
            $json

	        $result = Invoke-RestMethod -Uri $url -Headers @{"Content-Type"="application/json" } -Body $json -Method POST -TimeoutSec 600
        }        
    } Catch {
        Write-Host "Failure message: $_.Exception.Message" -ForegroundColor red
        Write-Host "Failure stack trace: $_.Exception.StackTrace" -ForegroundColor red
        Write-Host "Failure inner exception: $_.Exception.InnerException" -ForegroundColor red
    }
}

Function View-QueueLength($appName = 'Contoso')
{
    Try {
        Write-Host "View Queue Length for $appName...." -ForegroundColor Green

        $url = "Http://localhost:8082/$appName" + "RateAggregatorApp/api/stats/queue/length"
	    $result = Invoke-RestMethod -Uri $url -Headers @{"Content-Type"="application/json" } -Method GET -TimeoutSec 600
        $json = ConvertTo-Json $result -Depth 3
        $json
    } Catch {
        Write-Host "Failure message: $_.Exception.Message" -ForegroundColor red
        Write-Host "Failure stack trace: $_.Exception.StackTrace" -ForegroundColor red
        Write-Host "Failure inner exception: $_.Exception.InnerException" -ForegroundColor red
    }
}

Function View-Cities($appName = 'Contoso')
{
    Try {
        Write-Host "View cities for $appName...." -ForegroundColor Green

        $url = "Http://localhost:8082/$appName" + "RateAggregatorApp/api/stats/cities"
	    $result = Invoke-RestMethod -Uri $url -Headers @{"Content-Type"="application/json" } -Method GET -TimeoutSec 600
        $json = ConvertTo-Json $result -Depth 3
        $json
    } Catch {
        Write-Host "Failure message: $_.Exception.Message" -ForegroundColor red
        Write-Host "Failure stack trace: $_.Exception.StackTrace" -ForegroundColor red
        Write-Host "Failure inner exception: $_.Exception.InnerException" -ForegroundColor red
    }
}

Generate-RateRequests -appName Contoso -iterations 100
Generate-RateRequests -appName Fabrican -iterations 100

View-QueueLength -appName Contoso
View-QueueLength -appName Fabrican

View-Cities -appName Contoso
View-Cities -appName Fabrican

```

## What is next?

I think Service Fabric has a lot of great and useful features that make it is a great candidate for a lot of scenarios. I will post more articles about Service Fabric as I expand my knowledge in this really cool technology. 
