---
title:  Azure CLI Notes
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Azure]
---

This is just a note about [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/overview?view=azure-cli-latest) login options.

## Option 1:

Login interactively via a browser
```
az login
```

## Option 2:

The best way to login is to use an Azure Service Principal though. So I registered an application in Azure Directory i.e. `AzureCliScriptApp` and assigned a service principal. I will use this service principal to login.

### Create a service principal:

Make sure you are in the same tenant that you want to authenticate against. If not, use 'az account set --subscription "your-subs"' to set the account.

To display the Azure Directory apps:
```
az ad app list --display-name AzureCliScriptApp
```

The above will yield the app id ...a big string that looks like this: `e68ab97f-cff2-4b50-83d5-eec9fe266ccc`

```
az ad sp create-for-rbac --name e68ab97f-cff2-4b50-83d5-eec9fe266ccc --password s0me_passw0rd
{
  "appId": "some-app-id-you-will-use-to-sign-in",
  "displayName": "e68ab97f-cff2-4b50-83d5-eec9fe266ccc",
  "name": "http://e68ab97f-cff2-4b50-83d5-eec9fe266ccc",
  "password": "s0me_passw0rd",
  "tenant": "your-tenant-id"
}
```

To login with service principal:
```
az login --service-principal -u some-app-id-you-will-use-to-sign-in -p s0me_passw0rd --tenant your-tenant-id
```

## Useful Commands:

List all subscriptions
```
az account list --output table
```

Set the default account
```
az account set --subscription "Mosaic"
```

List the Clouds
```
az cloud list --output table
az cloud show --name AzureCloud --output json
```

## Kubernetes

if you are using the Azure CLI to provision a Kubernetes cluster, you should use this command if you used the service principal to login

```
az aks create --resource-group $rgName --name $k8sClusterName --service-principal $spAppId --client-secret $spPassword --node-count $k8sNodesCount --generate-ssh-keys
```
Where:
`$rgName` is the PowerShell variable that holds the resource group name
`$k8sClusterName` is the PowerShell variable that holds the k8s cluster name
`$spAppId` is the PowerShell variable that holds the service principal app id
`$spPassword` is the PowerShell variable that holds the service principal password
`$k8sNodesCount` is the PowerShell variable that holds the k8s cluster desired nodes count

Refer to this [doc](https://docs.microsoft.com/en-us/azure/aks/kubernetes-service-principal) for more information