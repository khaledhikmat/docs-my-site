---
title:  Service Fabric Secure Cluster Deployment
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Service Fabric]
---

In this post, I just used the Service Fabric team article [https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-cluster-creation-via-arm](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-cluster-creation-via-arm) to create a PowerShell script that will do the entire deployment. I also downloaded all the required helper PowerShell modules and placed them in one [repository](https://github.com/khaledhikmat/service-fabric-secure-deployment) so it would be easier for others to work with the deployment.

Here are some of my notes:

- The account you use to log in to Azure with must be a Global admin.
- In case of errors during deployment, please check the Azure Activity Logs. It is pretty good and provides a very useful insight to what went wrong.
- After a deployment is successful, you can modify the ARM template and re-deploy. This will update the cluster. For example, if you added a new LN port and re-deployed using the PowerShell script, that new port will be available.
- To connect to a secure cluster, use this guide: [https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-connect-to-secure-cluster](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-connect-to-secure-cluster) 
- Connect to the cluster using the browser [https://your-cluster.westus.cloudapp.azure.com:19080/Explorer/index.html ](https://your-cluster.westus.cloudapp.azure.com:19080/Explorer/index.html ) will cause a certificate error. This is expected as the script uses a self-signed certificate. Just proceed.  
- To log in to the fabric explorer requires that you complete the steps where you go to the AD in which the cluster belongs to, select the app that was created and assign an admin role to it as described in the above article. This must be done from the classic portal.
- To connect using PowerShell, use `Connect-ServiceFabricCluster -ConnectionEndpoint ${dnsName}:19000 -ServerCertThumbprint "6C84CEBF914FF489551385BA128542BA63A16222" -AzureActiveDirectory`. Please note that, similar to the browser, this requires that the user be assigned as in the previous step.
- Please note that securing the cluster does not mean that your own application endpoint is secured. You must do whatever you need to do to enable HTTPs in your own application and provide some sort of token authentication. 
- I noticed that the only VM size that worked reliably was the Standard_D2. Anything less than that causes health issues due to disk space, etc. I heard from Microsoft [here](https://social.msdn.microsoft.com/Forums/en-US/04915062-63fd-4608-94fb-f018c32e15c3/will-there-be-a-service-fabric-managed-service?forum=AzureServiceFabric) that they are working on ways to reduce the cost of the VMs, particularly by allowing us to use smaller VMs and still get the reasonable reliability/durability levels, which would help reduce costs without sacrificing the safety or uptime of our service.
