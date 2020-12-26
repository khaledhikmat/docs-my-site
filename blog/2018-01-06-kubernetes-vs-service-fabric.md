---
title:  Kubernetes vs. Service Fabric
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Service Fabric, Kubernetes]
---

Having been exposed to [Kubernetes](https://kubernetes.io/) and [Microsoft's Service Fabric](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-overview), the following are some of my notes about both platforms:

## Similarities

They are both orchestrators and pretty much can handle: 

- Container Images Hosting
- Scaling
- Healing
- Monitoring
- Rolling Updates
- Service Location

However, Service Fabric support for containers came recently. Initially, Azure Service Fabric was mostly an orchestrator for .NET processes running Windows only. 

## Strengths

#### Kubernetes:

In 2017, k8s became an industry standard. Every Cloud vendor offers full support and some offer Kubernetes as a Service such as Azure Kubernetes Service (AKS) where the vendor takes care of the cluster creation, maintenance and management.

Given this, it became obvious that if any business is planning to adopt Microservices as a developmemt strategy, they are most likely thinking about employing Kubernetes. Managed services offered by many Cloud vendors such as Azure AKS makes this decison a lot easier as dvelopers no longer have to worry about provisioning or maintaining k8s clusters.  

Besides the huge developer and industry support that it is currently receiving, K8s is a joy to work with. Deployments can be described in yaml or json and thrown at the cluster so it can make sure that the desired state is realized. Please refer to [this post](/blog/2018/01/04/netapp-docker-k8s) for more information. 

Not sure about these:
- Can k8s create singletons?
- Can I have multiple depoyments of the same Docker instance with different enviroment variables?

#### Service Fabric:

In my opinion, one of the most differentiating factor for Service Fabric is its developer-friendly programming model. It supports reliable stateless, stateful and actor models in a powerful yet abstracted way which makes programming in Service Fabric safe and easy. Please refer to earlier posts [here](/blog/2016/12/15/service-fabric-fundamentals) and [here](/blog/2017/01/10/service-fabric-notes) for more information. 

In addition, Service Fabric supports different ways to host code:

- Guest Executable i.e. unmodified Win32 applications or services
- Guest Windows and Linux containers
- Reliable stateless and stateful services in .NET C#, F# and Java
- Reliable actors in .NET C#, F# and Java

The concept of app in Service Fabric is quite sophisticated allowing developers to create an app type and instantiate many copies of it making the concept work well in multi-tenant deployments. 

## Weaknesses

#### Kubernetes:

I am not in a position to state any weaknesses for k8s. But, from (perhaps) a very naive perspective, I would say that:
- The lack of standard programming models is definitely something that can be improved.
- K8s can only work with containers! So any piece of code that must deployed to k8s must be containerized first. 
- Currently k8s is only a Linux orchestrator. Although a beta 1.9 version is said to support Windows containers. 

#### Service Fabric

One of the major setbacks for Service Fabric (or at least the public version that was made available) is that it was conceived at a time when k8s is burgeoning into an industry standard. It is becoming very difficult for Microsoft to convince developers and businesses to adopt this semi-proprieytary platform when they can use k8s. 

There are also a couple of things that can be improved:
- Service Fabric relies on XML documents to describe services and configuration.
- Reliance on Visual Studio although it is possible to do things in Service Fabric without Visual Studio as demonstrated [here](/blog/2016/12/02/service-fabric-basics) 

## Future

I love Service Fabric! But unfortunately (I say unfortyantely because I actually did spend a lot of time on it), I don't think it has a particularly great future given the strength and the momentum of k8s. Ideally Microsoft should continue to suppprt k8s in a strong way, perhaps port its Service Fabric programming model to work on k8s using .NET Core and eventually phase out Service Fabric.
