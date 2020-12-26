---
title:  Service Fabric Basics
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Service Fabric]
---

Service Fabric is a cool technology from Microsoft! It has advanced features that allows many scenarios. But in this post, we will only cover basic concepts that are usually misunderstood by a lot of folks.

For the purpose of this demo, we are going to develop a very basic guest executable service written as a console app. We will use very basic application and service manifests and PowerShell script to deploy to Service Fabric and show how Service Fabric monitors services, reports their health and allows for upgrade and update. 

The source code for this post is available [here](/blog/2016/12/02/service-fabric-basics). Most of the code and ideas are credited to Jeff Richter of the Service Fabric Team.

## Guest Service  

The Guest service is a basic `Win32` console app that invokes an `HttpListener` on a port that is passed in the argument. The little web server responds to requests like so:

![Web Server](http://i.imgur.com/YqTjqBD.png)

Note that the service is NOT running the Service Fabric cluster.


That is it!! This simple web server accepts a command called `crash` which will kill the service completely:

```
http://localhost:8800?cmd=crash
```

In fact, it does support multiple commands:

```
var command = request.QueryString["cmd"];
if (!string.IsNullOrEmpty(command))
{
    switch (command.ToLowerInvariant())
    {
        case "delay":
            Int32.TryParse(request.QueryString["delay"], out _delay);
            break;
        case "crash":
            Environment.Exit(-1);
            break;
    }
}
```

In order to make this service highly available, let us see how we can package this service to run within Service Fabric. Please note that this service is not cognizant of any Service Fabric. It is purely a simple `Win32` service written as a console app.

**Please note:**

-  To debug the service locally from Visual Studio, you need to start VS in administrator mode.
-  Service Fabric requires the projects be `X64`! So you must change your projects to use `X64` by using the Visual Studio Configuration Manager.

## Application Package

Application Package in Service Fabric is nothing but a folder that contains certain manifests in specific sub-folders! We will build the directory by hand instead of using Visual Studio so we can find out exactly how to do these steps. Let us create a directory called `BasicAvailabilityApp` (i.e.  `c:\BasicAvailabilityApp`) to describe the Service Fabric application. 

### The root folder

The root folder contains the application manifest and a sub-folder for each service in contains. Here is how the application manifest looks like for this demo application:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ApplicationManifest ApplicationTypeName="BasicAvailabilityAppType" ApplicationTypeVersion="1.0.0"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                     xmlns="http://schemas.microsoft.com/2011/01/fabric">
   <ServiceManifestImport>
      <ServiceManifestRef ServiceManifestName="CrashableServiceTypePkg" ServiceManifestVersion="1.0.0" />
   </ServiceManifestImport>
</ApplicationManifest>
```

There are several pieces of information in this manifest:

- The application type: `BasicAvailabilityAppType`.
- The application version: `1.0.0`.
- The application contains a single service type `CrashableServiceTypePkg` with version `1.0.0`.
- The XML name spaces are not important to us.

This is how the application folder looks like: 

![Root Application Folder](http://i.imgur.com/VMARUS3.png)

### The service folder

The service folder contains the service manifest and a sub-folder for each service in contains. Here is how the application manifest looks like for this demo application:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ServiceManifest Name="CrashableServiceTypePkg"
                 Version="1.0.0"
                 xmlns="http://schemas.microsoft.com/2011/01/fabric"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ServiceTypes>
    <StatelessServiceType ServiceTypeName="CrashableServiceType" UseImplicitHost="true" />
  </ServiceTypes>

  <CodePackage Name="CrashableCodePkg" Version="1.0.0">
    <EntryPoint>
      <ExeHost>
        <Program>CrashableService.exe</Program>
        <Arguments>8800</Arguments>
      </ExeHost>
    </EntryPoint>
  </CodePackage>

  <!-- ACL the 8800 port where the crashable service listens -->
  <Resources>
    <Endpoints>
      <Endpoint Name="InputEndpoint" Port="8800" Protocol="http" Type="Input" />
    </Endpoints>
  </Resources>
</ServiceManifest>
```

There are several pieces of information in this manifest:

- The service package: `CrashableServiceTypePkg`.
- The service version: `1.0.0`.
- The service type: `CrashableServiceType`.
- The service type is stateless.
- The service code package exists in a sub-folder called `CodePkg` and it is of version `1.0.0`.
- The service code consists of an executable called `CrashableService.exe`.
- The XML name spaces are not important to us.
- The `Endoints` must be specified to allow the Service Fabric to `ACL` the port that we want opened for our service to listen on. The `Input` type instructs SF to accepts input from the Internet.

This is how the service folder looks like: 

![service Folder](http://i.imgur.com/0bA48hy.png)

This is what it takes to package an application in Service Fabric. 

## Deployment

Please note that the package we created in the previous step needs to be deployed to Service Fabric in order to run. To do this, we will need to use either Visual Studio or PowerShell. Since we want to use the lower level commands, we will use PowerShell instead of Visual Studio:

Here is the PowerShell script that we can use:

```
# Define equates (hard-coded):
$clusterUrl = "localhost"
$imageStoreConnectionString = "file:C:\SfDevCluster\Data\ImageStoreShare" 
$appPkgName = "BasicAvailabilityAppTypePkg"
$appTypeName = "BasicAvailabilityAppType"
$appName = "fabric:/BasicAvailabilityApp"
$serviceTypeName = "CrashableServiceType"
$serviceName = $appName + "/CrashableService"

# Connect PowerShell session to a cluster
Connect-ServiceFabricCluster -ConnectionEndpoint ${clusterUrl}:19000

# Copy the application package to the cluster
Copy-ServiceFabricApplicationPackage -ApplicationPackagePath "BasicAvailabilityApp" -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Register the application package's application type/version
Register-ServiceFabricApplicationType -ApplicationPathInImageStore $appPkgName

# After registering the package's app type/version, you can remove the package from the cluster image store
Remove-ServiceFabricApplicationPackage -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Create a named application from the registered app type/version
New-ServiceFabricApplication -ApplicationTypeName $appTypeName -ApplicationTypeVersion "1.0.0" -ApplicationName $appName 

# Create a named service within the named app from the service's type
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $serviceTypeName -ServiceName $serviceName -Stateless -PartitionSchemeSingleton -InstanceCount 1

```

The key commands are the last two where we:

- Create a named application name from the registered application type and version:

```
# Create a named application from the registered app type/version
New-ServiceFabricApplication -ApplicationTypeName $appTypeName -ApplicationTypeVersion "1.0.0" -ApplicationName $appName 
```
- Create a named service within the named app from the service type:

```
# Create a named service within the named app from the service's type
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $serviceTypeName -ServiceName $serviceName -Stateless -PartitionSchemeSingleton -InstanceCount 1
```

This is extremely significant as it allows us to create multiple application instances within the same cluster and each named application instance has its own set of services. This is how the named application and services are related to the cluster (this is taken from Service Fabric team presentation):

![Naming Stuff](http://i.imgur.com/377RP4J.png)

Once the named application and the named service are deployed, the Service Fabric explorer shows it like this:

![Success Deployment](http://i.imgur.com/tTLgIMX.png)

Now, if we access the service in Service Fabric, we will get a response that clearly indicates that the service is indeed running in Service Fabric:

![Deployed in SF](http://i.imgur.com/AI9jYOV.png)

Note that the service is running in Node 1 of the Service Fabric cluster.

## Availability
 
One of the major selling points of Service Fabric is its ability to make services highly available by monitoring them and restarting them if necessary.  

Regardless of whether the service is guest executable or Service Fabric cognizant service, Service Fabric monitors the service to make sure it runs correctly. In our case, the service will crash whenever a `crash` command is submitted. So if you crash the service, you will see that Service Fabric detects the failure and reports a bad health on the Service Fabric Explorer:

![Error Deployment](http://i.imgur.com/XdY1JHg.png)

You will notice that the little web server is no longer available when you try to access it. But if you wait for a few seconds and try again, you will be very happy to know that the web server is available again. This is because Service Fabric detected that the service went down, restarted it and made it available holding to the promise of `high availability` or `self healing`.

However, there is only one little problem! The unhealthy indicators (warning or errors) on the explorer may never go away because there isn't anything that resets them. So the health checks will also be shown once they are reported. This could become a little of a problem if you have an external tool that read health check state. 

**The above statement is not entirely true! I have seen the latest versions of Service Fabric remove the warning/errors after a little while.**

In any case, I will show a better way (in my opinion) to deal with this shortly in this post. So read on if you are interested.

## Cleanup

In order to remove the named application and its services, you can issue these PowerShell commands:

```
# Delete the named service
Remove-ServiceFabricService -ServiceName $serviceName -Force

# Delete the named application and its named services
Remove-ServiceFabricApplication -ApplicationName $appName -Force
```

In order to delete the application type:

```
# If no named apps are running, you can delete the app type/version
Unregister-ServiceFabricApplicationType -ApplicationTypeName $appTypeName -ApplicationTypeVersion "1.0.0" -Force
```

## Versions & Upgrade

It turned out that Service Fabric does not really care how you name your versions! If you name your versions as numbers like 1.0.0 or 1.1.0, this naming convention is referred to as `Semantic Versioning`. But you are free to use whatever version naming convention you want. 

Let us use a different version scheme for our simple app. How about alpha, beta and productionV1, productionV2, etc. Let us cleanup our app from the cluster (as shown above), apply some changes to the `crashable` service, update the manifest files to make the version `Beta` and re-deploy using the beta version:

### The Application Manifest

```xml
<?xml version="1.0" encoding="utf-8"?>
<ApplicationManifest ApplicationTypeName="BasicAvailabilityAppType" 
					 ApplicationTypeVersion="Beta"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                     xmlns="http://schemas.microsoft.com/2011/01/fabric">
   <ServiceManifestImport>
      <ServiceManifestRef ServiceManifestName="CrashableServiceTypePkg" ServiceManifestVersion="Beta" />
   </ServiceManifestImport>
</ApplicationManifest>
```

### The Service Manifest

```xml
<?xml version="1.0" encoding="utf-8"?>
<ServiceManifest Name="CrashableServiceTypePkg"
                 Version="Beta"
                 xmlns="http://schemas.microsoft.com/2011/01/fabric"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ServiceTypes>
    <StatelessServiceType ServiceTypeName="CrashableServiceType" UseImplicitHost="true" />
  </ServiceTypes>

  <CodePackage Name="CrashableCodePkg" Version="Beta">
    <EntryPoint>
      <ExeHost>
        <Program>CrashableService.exe</Program>
        <Arguments>8800</Arguments>
      </ExeHost>
    </EntryPoint>
  </CodePackage>

  <!-- ACL the 8800 port where the crashable service listens -->
  <Resources>
    <Endpoints>
      <Endpoint Name="InputEndpoint" Port="8800" Protocol="http" Type="Input" />
    </Endpoints>
  </Resources>
</ServiceManifest>
```

### Deployment

```
# Define equates (hard-coded):
$clusterUrl = "localhost"
$imageStoreConnectionString = "file:C:\SfDevCluster\Data\ImageStoreShare" 
$appPkgName = "BasicAvailabilityAppTypePkg"
$appTypeName = "BasicAvailabilityAppType"
$appName = "fabric:/BasicAvailabilityApp"
$serviceTypeName = "CrashableServiceType"
$serviceName = $appName + "/CrashableService"

# Connect PowerShell session to a cluster
Connect-ServiceFabricCluster -ConnectionEndpoint ${clusterUrl}:19000

# Copy the application package to the cluster
Copy-ServiceFabricApplicationPackage -ApplicationPackagePath "BasicAvailabilityApp" -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Register the application package's application type/version
Register-ServiceFabricApplicationType -ApplicationPathInImageStore $appPkgName

# After registering the package's app type/version, you can remove the package from the cluster image store
Remove-ServiceFabricApplicationPackage -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Create a named application from the registered app type/version
New-ServiceFabricApplication -ApplicationTypeName $appTypeName -ApplicationTypeVersion "Beta" -ApplicationName $appName 

# Create a named service within the named app from the service's type
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $serviceTypeName -ServiceName $serviceName -Stateless -PartitionSchemeSingleton -InstanceCount 1
```

### Upgrade

Now that the beta version is deployed, let us make another change in the service, change the version to ProdutionV1 (in the application and service manifests) and issue the following PowerShell commands to register and upgrade to `ProductionV1`


```
# Copy the application package ProductionV1 to the cluster
Copy-ServiceFabricApplicationPackage -ApplicationPackagePath "BasicAvailabilityApp-ProductionV1" -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Register the application package's application type/version
Register-ServiceFabricApplicationType -ApplicationPathInImageStore $appPkgName

# After registering the package's app type/version, you can remove the package
Remove-ServiceFabricApplicationPackage -ImageStoreConnectionString $imageStoreConnectionString -ApplicationPackagePathInImageStore $appPkgName

# Upgrade the application from Beta to ProductionV1
Start-ServiceFabricApplicationUpgrade -ApplicationName $appName -ApplicationTypeVersion "ProductionV1" -UnmonitoredAuto -UpgradeReplicaSetCheckTimeoutSec 100
```

The upgrade takes place using a concept called Upgrade Domains which makes sure that the service that is being upgraded does not ever become unavailable:

![Upgrade Domains](http://i.imgur.com/eSmVVHd.png)

Once the upgrade is done, the new application and service version is `ProductionV1`:

![Production V1](http://i.imgur.com/l5Ohfgk.png)

## Updates

Now that our service is in production, let us see what how we can increase and decrease its number of instances at will. This is very useful to scale the service up and down depending on parameters determined by the operations team. 

You may have noticed that we have always used instance count 1 when we deployed our named service:

```
# Create a named service within the named app from the service's type
New-ServiceFabricService -ApplicationName $appName -ServiceTypeName $serviceTypeName -ServiceName $serviceName -Stateless -PartitionSchemeSingleton -InstanceCount 1
```

Let us try to increase the instance count to 5 using PowerShell:

```
# Dynamically change the named service's number of instances
Update-ServiceFabricService -ServiceName $serviceName -Stateless -InstanceCount 5 -Force
```

**Please note** that if your test cluster has less than 5 nodes, you will get health warnings from Service Fabric because SF will not be place more instances than the number of available nodes. This is because SF cannot guarantee availability if it places multiple instances on the same node.

Anyway, if you get health warning or if you would like to scale back on your service, you can downgrade the number of instances using this PowerShell command:

```
Update-ServiceFabricService -ServiceName $serviceName -Stateless -InstanceCount 1 -Force
``` 

Please notice how fast the scaling (up or down) takes place!!

## Better High Availability

In a previous section in this post, we deployed the `crashable` service and watched it crash when we submitted a `crash` command. Service Fabric reported the failure, restarted the service and made it available again. Now we will modify the deployment process to provide a better way to take care of the re-start process. 

To do so, we will need another service that monitors our `crashable` service and reports health checks to Service Fabric. This new code is Service Fabric aware and is demonstrated by Jeff Richter of the Service Fabric team.

Let us modify the application package to include this new code. Remember our goal is not to change the `crashable` service at all. 

### The Service Manifest

```xml
<?xml version="1.0" encoding="utf-8"?>
<ServiceManifest Name="CrashableServiceTypePkg"
                 Version="Beta"
                 xmlns="http://schemas.microsoft.com/2011/01/fabric"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ServiceTypes>
    <StatelessServiceType ServiceTypeName="CrashableServiceType" UseImplicitHost="true" />
  </ServiceTypes>

  <!-- Code that is NOT Service-Fabric aware -->
  <!-- Remove Console Redirection in production -->
  <!-- https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-deploy-existing-app -->
  <CodePackage Name="CrashableCodePkg" Version="Beta">
    <EntryPoint>
      <ExeHost>
        <Program>CrashableService.exe</Program>
        <Arguments>8800</Arguments>
		<ConsoleRedirection FileRetentionCount="5" FileMaxSizeInKb="2048"/>
      </ExeHost>
    </EntryPoint>
  </CodePackage>

  <!-- Code that is Service-Fabric aware -->
  <!-- Remove Console Redirection in production -->
  <!-- https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-deploy-existing-app -->
  <CodePackage Name="MonitorCodePkg" Version="Beta">
    <EntryPoint>
      <ExeHost>
        <Program>MonitorService.exe</Program>
        <Arguments>8800</Arguments>
		<ConsoleRedirection FileRetentionCount="5" FileMaxSizeInKb="2048"/>
      </ExeHost>
    </EntryPoint>
  </CodePackage>

  <!-- ACL the 8800 port where the crashable service listens -->
  <Resources>
    <Endpoints>
      <Endpoint Name="InputEndpoint" Port="8800" Protocol="http" Type="Input" />
    </Endpoints>
  </Resources>
</ServiceManifest>
```

There are several things here:

- Our `crashable` service is still the same. It accepts an argumengt to tell it which port number to listen on.
- `ConsoleRedirection` is added to allow us to see the console output in the SF log files. This is to be removed in production.
- Now there is one service i.e. `CrashableServiceType` but two code bases: one for the original exe and another code for the monitor that will monitor our `crashable` service. This is really nice as it allows us to add Service Fabric code to an existing service without much of intervention.
- The `Endoints` must be specified to allow the Service Fabric to `ACL` the port that we want opened for our service to listen on. The `Input` type instructs SF to accepts input from the Internet.

The package folders look like this:

![Advanced Service Dir](http://i.imgur.com/fYG5oLe.png)

### The Monitor Service

It is also a console app!! But it includes a Service Fabric Nuget package so it can use the `FabricClient` to communicate health checks to the local cluster. Basically, it sets up a timer to check the performance and availability of our `crashable` service. It reports to Service Fabric when failures take place. 

Doing so makes our `crashable` service much more resilient to crashes or slow performances as it is monitored by the monitored service and re-started if necessary by Service Fabric. The health checks are also cleared much quicker.

### Console Outputs in the local cluster
 
You can use the Service Fabric cluster explorer to find out where Service Fabric stores services on disk. This is available from the Nodes section:

![SF Cluster Nodes](http://i.imgur.com/bvXbjc2.png)

![Node Disk](http://i.imgur.com/lqq6NJ4.png)

This directory has a `log` folder that stores the output of each service. This can be very useful for debug purposes. To use it, however, you must have the `ConsoleRedirection` turned on as shown above.

## What is next?

In future posts, I will use Service Fabric .NET programming model to develop and deploy stateless and stateful services to demonstrate Service Fabric fundamental concepts. 
