---
title:  Web Tests Thoughts
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Test]
---

If a Web App is deployed on Azure, both the [App Insights](https://azure.microsoft.com/en-us/services/application-insights/) and [Web Apps](https://azure.microsoft.com/en-us/services/app-service/web/) offer a utility that can hammer the app's endpoints from different regions. While this functionality is quite nice and comes bundled in, it is considered an alert-based system and is slightly rudimentary as one cannot customize the test or get access to the full results easily. This post describes an alternative approach that uses [Azure Functions](https://azure.microsoft.com/en-us/services/functions/) or [Service Fabric](https://azure.microsoft.com/en-us/services/service-fabric/) to implement a web test that can test and endpoint and report its test to PowerBI in real time.

What I really wanted to do is to conduct a web test for a duration of time from different regions against a new product's endpoints at launch time and immediately view the test results with executives. 

## Azure Functions

Briefly, here is what I decided to do:

- Use PowerShell to provision resource groups in four different regions. Each resource group contains an Azure Function App that loads its source code from a code repository.
- Use source code changes to trigger updates to all the functions apps at the same time.
- Configure the Azure Functions App to test a Web URL or a collection. This test can be sophisticated because we have the full power of an Azure Function to conduct the test. In other words, the test can be running through a use case scenario as opposed to just posting to a URL, for example. 
- Auto-trigger the Azure Functions by a timer (i.e. configurable) to repeat the test.
- Report the source (i.e region), duration, URL, date time and status code to a PowerBI real-time data set at the end of every test iteration.
- Create a real-time visualization to see, in real-time, the test results.
- Use PowerShell script to de-provision the resource groups when the test is no longer needed. 

The source code can be found [here](https://github.com/khaledhikmat/serverless-webtest).

### Macro Architecture

![Web Test using Azure Functions](http://i.imgur.com/2NMuHBC.png)

### Azure Resource Group Template

I downloaded an Azure Function template and modified it to suit my needs. The main thing in the template is that it defines the repository URL and branch from which the source code is to be imported and the definitions of the app strings:

Here is the entire template:

```
{
    "$schema": "http://schemas.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "appName": {
            "type": "string",
            "metadata": {
                "description": "The name of the function app that you wish to create."
            }
        },
        "storageAccountType": {
            "type": "string",
            "defaultValue": "Standard_LRS",
            "allowedValues": [
                "Standard_LRS",
                "Standard_GRS",
                "Standard_ZRS",
                "Premium_LRS"
            ],
            "metadata": {
                "description": "Storage Account type"
            }
        },
        "repoURL": {
            "type": "string",
            "defaultValue": "https://<ourown>.visualstudio.com/DefaultCollection/Misc/_git/WebTest",
            "metadata": {
                "description": "The URL for the GitHub repository that contains the project to deploy."
            }
        },
        "branch": {
            "type": "string",
            "defaultValue": "master",
            "metadata": {
                "description": "The branch of the GitHub repository to use."
            }
        }
    },
    "variables": {
        "functionAppName": "[parameters('appName')]",
        "hostingPlanName": "[parameters('appName')]",
        "storageAccountName": "[concat(uniquestring(resourceGroup().id), 'azfunctions')]",
        "storageAccountid": "[concat(resourceGroup().id,'/providers/','Microsoft.Storage/storageAccounts/', variables('storageAccountName'))]"
    },
    "resources": [
        {
            "type": "Microsoft.Storage/storageAccounts",
            "name": "[variables('storageAccountName')]",
            "apiVersion": "2015-06-15",
            "location": "[resourceGroup().location]",
            "properties": {
                "accountType": "[parameters('storageAccountType')]"
            }
        },
        {
            "type": "Microsoft.Web/serverfarms",
            "apiVersion": "2015-04-01",
            "name": "[variables('hostingPlanName')]",
            "location": "[resourceGroup().location]",
            "properties": {
                "name": "[variables('hostingPlanName')]",
                "computeMode": "Dynamic",
                "sku": "Dynamic"
            }
        },
        {
            "apiVersion": "2015-08-01",
            "type": "Microsoft.Web/sites",
            "name": "[variables('functionAppName')]",
            "location": "[resourceGroup().location]",
            "kind": "functionapp",            
            "dependsOn": [
                "[resourceId('Microsoft.Web/serverfarms', variables('hostingPlanName'))]",
                "[resourceId('Microsoft.Storage/storageAccounts', variables('storageAccountName'))]"
            ],
            "properties": {
                "serverFarmId": "[resourceId('Microsoft.Web/serverfarms', variables('hostingPlanName'))]",
                "siteConfig": {
                    "appSettings": [
                        {
                            "name": "AzureWebJobsDashboard",
                            "value": "[concat('DefaultEndpointsProtocol=https;AccountName=', variables('storageAccountName'), ';AccountKey=', listKeys(variables('storageAccountid'),'2015-05-01-preview').key1)]"
                        },
                        {
                            "name": "AzureWebJobsStorage",
                            "value": "[concat('DefaultEndpointsProtocol=https;AccountName=', variables('storageAccountName'), ';AccountKey=', listKeys(variables('storageAccountid'),'2015-05-01-preview').key1)]"
                        },
                        {
                            "name": "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING",
                            "value": "[concat('DefaultEndpointsProtocol=https;AccountName=', variables('storageAccountName'), ';AccountKey=', listKeys(variables('storageAccountid'),'2015-05-01-preview').key1)]"
                        },
                        {
                            "name": "WEBSITE_CONTENTSHARE",
                            "value": "[toLower(variables('functionAppName'))]"
                        },
                        {
                            "name": "FUNCTIONS_EXTENSION_VERSION",
                            "value": "~1"
                        },
                        {
                            "name": "WEBSITE_NODE_DEFAULT_VERSION",
                            "value": "6.5.0"
                        },
                        {
                            "name": "location",
                            "value": "[resourceGroup().location]"
                        },
                        {
                            "name": "testUrl",
                            "value": "http://your-own.azurewebsites.net"
                        }
                    ]
                }
            }, 
            "resources": [
                {
                    "apiVersion": "2015-08-01",
                    "name": "web",
                    "type": "sourcecontrols",
                    "dependsOn": [
                        "[resourceId('Microsoft.Web/Sites', variables('functionAppName'))]"
                    ],
                    "properties": {
                        "RepoUrl": "[parameters('repoURL')]",
                        "branch": "[parameters('branch')]",
                        "isManualIntegration": false
                    }
                }
            ]                     
        }
    ]
}

```
Here is the template parameters file:

```
{
  "$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "appName": {
      "value": "WebTestFunctions"
    }
  }
}
```

### PowerShell Script

The PowerShell script is the main driver that orchestrates the deployment and of the different Azure Functions to different resource groups. Here is the complete script:

```
# Login to Azure first
Login-AzureRmAccount

# Select the subscription
Get-AzureRmSubscription | select SubscriptionName
$subscr = "YourOwn"
Select-AzureRmSubscription -SubscriptionName $subscr

# 1. create a new resource group in west US
New-AzureRmResourceGroup -Name WebTest4WestUS -Location "West US"

# 1.5. deploy the template to the west us resource group
New-AzureRmResourceGroupDeployment -Name WebTest4WestUSDeployment -ResourceGroupName WebTest4WestUS `
  -TemplateFile azuredeploy.json  

# 2. create a new resource group in west europe
New-AzureRmResourceGroup -Name WebTest4WestEurope -Location "West Europe"

# 2.5. deploy the template to the west europe resource group
New-AzureRmResourceGroupDeployment -Name WebTest4WestEuropeDeployment -ResourceGroupName WebTest4WestEurope `
  -TemplateFile azuredeploy.json

# 3. create a new resource group in West Japan
New-AzureRmResourceGroup -Name WebTest4WestJapan -Location "Japan West"

# 3.5. deploy the template to the west japan resource group
New-AzureRmResourceGroupDeployment -Name WebTest4WestJapanDeployment -ResourceGroupName WebTest4WestJapan `
  -TemplateFile azuredeploy.json    

# 4. create a new resource group in South Brazil
New-AzureRmResourceGroup -Name WebTest4SouthBrazil -Location "Brazil South"

# 4.5. deploy the template to the south brazil resource group
New-AzureRmResourceGroupDeployment -Name WebTest4SouthBrazilDeployment -ResourceGroupName WebTest4SouthBrazil `
  -TemplateFile azuredeploy.json  
  
######

# Delete the resource groups
Remove-AzureRmResourceGroup -Name WebTest4WestUS -Force
Remove-AzureRmResourceGroup -Name WebTest4WestEurope -Force
Remove-AzureRmResourceGroup -Name WebTest4WestJapan -Force
Remove-AzureRmResourceGroup -Name WebTest4SouthBrazil -Force   
```

Once you run the deployments, u will see something like this in your subscription resource groups:

![Resource Groups](http://i.imgur.com/8LgDuHA.png)

### PowerBI Real-Time Dataset

Using this [nifty feature](https://powerbi.microsoft.com/en-us/documentation/powerbi-service-real-time-streaming/) in PowerBI, I defined a real-time dataset that looks like this:

![PowerBI Real Time Dataset](http://i.imgur.com/x6SvVgS.png)

This gave me a URL that I can use from Azure Functions to pump data into this Real-time dataset. Also please note that I enbaled the `historic data analysis` to allow me to report on the data and visualize it in real-time and beyond.

### Azure Function Source Code

Finally, the Azure Function source code that conducts the test and reports to PowerBI:

```
#r "Newtonsoft.Json"

using System;
using System.Text;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using Newtonsoft.Json;

public static async Task Run(TimerInfo cacheTimer, TraceWriter log)
{
    var location = GetEnvironmentVariable("location");
    log.Info($"Web Test trigger executed at {DateTime.Now} from {location}");    

    try 
    {
        var testUrl = GetEnvironmentVariable("testUrl");
        if (!string.IsNullOrEmpty(testUrl))
        {
            string [] results = await TestUrl(testUrl, log);                
            if (results != null && results.Length == 2)
            {
                // Condition the event to meet the Real-Time PowerBI expectation
                var realTimeEvent = new {
                    time = DateTime.Now,
                    source = GetEnvironmentVariable("location"),
                    url  = testUrl,
                    duration  = Double.Parse(results[1]),
                    result = results[0]
                };

                var events = new List<dynamic>();
                events.Add(realTimeEvent);
                await PostToPowerBI(events, log);
            }
            else
            {
                log.Info($"Bad results from testing url!");
            }
        }
        else
            log.Info($"No Test URL!");
    }
    catch (Exception e)
    {
        log.Info($"Encountered a failure: {e.Message}");
    }
}

private async static Task<string []> TestUrl(string url, TraceWriter log)
{
    var results = new string[2];
    var statusCode = "";
    HttpClient client = null;
    DateTime startTime = DateTime.Now;
    DateTime endTime = DateTime.Now;

    try
    {
        client = new HttpClient();

        HttpResponseMessage response = await client.GetAsync(url);
        statusCode = response.StatusCode.ToString();    
    }
    catch (Exception ex)
    {
        log.Info($"TestUrl failed: {ex.Message}");
        statusCode = "500";
    }
    finally
    {
        if (client != null)
            client.Dispose();
    }

    endTime = DateTime.Now;
    results[0] = statusCode;
    results[1] = (endTime - startTime).TotalSeconds + "";
    return results;
}

private async static Task PostToPowerBI(object realTimeEvents, TraceWriter log)
{
    HttpClient client = null;
    // The URL for PowerBI Real Time Dataset
    var url = "https://api.powerbi.com/beta/your-own"; // Should be made into an app setting

    try
    {
        client = new HttpClient();

        var postData = Newtonsoft.Json.JsonConvert.SerializeObject(realTimeEvents);
        HttpContent httpContent = new StringContent(postData, Encoding.UTF8, "application/json");
        HttpResponseMessage response = await client.PostAsync(url , httpContent);
        string responseString = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception("Bad return code: " + response.StatusCode);
        }
    }
    catch (Exception ex)
    {
        log.Info($"PostToPowerBI failed: {ex.Message}");
    }
    finally
    {
        if (client != null)
            client.Dispose();
    }
}

public static string GetEnvironmentVariable(string name)
{
    return System.Environment.GetEnvironmentVariable(name, EnvironmentVariableTarget.Process);
}
```

### Results Visualization

If we deploy the Azure Functions and collect the results in PowerBI, we can get real-time results that look like this:

![Web Test Results 1](http://i.imgur.com/Dc1B6Jm.png)

![Web Test Results 2](http://i.imgur.com/ZI3Qfps.png)

Hopefully this visualization helps executives to see a clear indication that the product launch is not that successful :-) 

## Service Fabric

I also wanted to mantion that Azure Service Fabric could also be used to conduct a web test from hammering the test site from multiple instances. Briefly, here is what I thought of doing:

- Create a Web Test Application Type. The Service Fabric app contains a single stateless service which does work on its RunAsync method.
- Use a PowerShell script to instantiate multiple tenants (or named applications): one for each region. Please note that the tenants simulate the different regions as they are all sitting in the same cluster!
- Update (i.e increase or decrease the number of the stateless service instances) each tenant (or named application) independently. This means that, unlike the Azure Functions, the system under-test can be hammered from multiple instances within the same tenant if need be.
- Write sophisticated tests within Service Fabric because the stateless service is doing it and the service can have a lot of configuration to govern that process.
- Report the source (i.e region), duration, URL, date time and status code to a PowerBI real-time data set at the end of every test iteration.
- Create a real-time visualization to see, in real-time, the test results.
- Use PowerShell script to de-provision the resource groups when the test is no longer needed. 

I will publish the Service Fabric web test solution in a different blog post. For now, here is the macro architecture that I am thinking about:

![Azure Service Fabric Macro Architecture](http://i.imgur.com/3f1bA7X.png)




