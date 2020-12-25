---
title:  Open Azure VM Port
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Windows]
---

For a project I was working on, I needed to create a Windows VS2015 VM for testing. It is quit easy to spawn a VM in Azure ...it only takes a couple of seconds to do it from the portal. The next task was to open up port 8080 on that machine as I needed to access that port for testing.

### Windows Server 2012

Since the VM is a Windows Server 2012, all I needed to do is to go the server's Server Manager => Local Server and access the Windows Firewall. At the firewall, I access the advanced setting to add a new inbound rule for protocol type TCP and local port is 8080:

![Inbound Rule](http://i.imgur.com/gqnnSyV.png)

### Azure Endpoints

The above step is not enough to expose port 8080! What we also need is to let the VM's Network Security Group about this new endpoint that we want to allow. To do that, you also need to locate the VM's Resource Group. The new ARM-based Azure VMs have several things in the resource group:

- Virtual Machine
- Network Interface
- Network Security Group
- Public IP Address
- Virtual Network
- Storage Account

We access the Network Security Group:

![Network Security Group](http://i.imgur.com/VIJyh6U.png)

and add the Inbound Rule for port 8080:

![NSG Inbound Rule](http://i.imgur.com/Pi32vAf.png)

This will allow us to access port 8080 in the VM.

Please note that the instructions above are for the Azure ARM-based VMs...not the classic ones.

 