---
title:  Service Fabric Notes
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Service Fabric]
---

I am compiling notes when working with [Service Fabric](https://azure.microsoft.com/en-us/services/service-fabric/) from the folks at Microsoft! In this post, I will enumerate a few things that I ran into which I think might be helpful to others who are learning the environment as well. This will not be a complete list ....so I will add to it as I go along.

### Actor Turn-based Concurrency

Actors are single threaded! They only allow one thread to be acting on them at any given time. In fact, in the Service Fabric terminology, this is referred to as Turn-based treading. From my observation, it seems that this is how the platform and the actors 

What happens to the clients who are calling the actors? If two clients are trying to access an actor at the same time, one blocks until the actor finishes the first client method. This is to ensure that an actor works on one thing at a time. 

Let us say, we have an actor that has two methods like this:

```csharp
public Task<string> GetThing1()
{
    // Simulate long work
    Thread.Sleep(5000);
    return Task.FromResult<string>("thing1");
}

public Task<string> GetThing2()
{
    // Simulate long work
    Thread.Sleep(10000);
    return Task.FromResult<string>("thing2");
}
```

If you call `GetThing1` from one client and immediately call `GetThing2` from another client (or Postman session), the second client will wait at least 15 seconds to get the string `thing2` response.

Given this:

- I think it is best to front-end actors with a service that can invoke methods on actors when it receives requests from a queue. This way the service is waiting on actors to complete processing while it is in its `RunAsync` method.
- It is important to realize that actors should really not be queried and that actors should employ several things:
	- Backup state to an external store such as DocumentDB or others. This way the external store can be queried instead.
	- Aggregate result externally perhaps via Azure Function into some outside store so queries could run against this store
	- Aggregate result to an aggregator actor that can quickly respond to queries which will relieve the processing actors from worrying about query requests.

### Actor Reminders

[Actor Reminders](https://azure.microsoft.com/en-us/documentation/articles/service-fabric-reliable-actors-timers-reminders/) are really nice to have. In the sample app that I am working on, I use them to schedule processing after I return to the caller. Effectively they seem to give me the ability to run things asynchronously and return to the caller right away. Without this, the actor processing throughput may not be at best if the the processing takes a while to complete. 
   
In addition to firing a future event, they do allow me to pack an item or object that can be retrieved when the reminder triggers. This makes a lot of scenarios possible because we are able to pack the item that we want the reminder to work on.
  
*Please note, however, that when a reminder is running in an actor, that actor cannot respond to other method invocation! This is because the platform makes sure that there is only a single threaded operating on an actor at any time.* 

The best way I found out to schedule reminders to fire immediately is something like this:

```csharp
public async Task Process(SomeItem item)
{
	var error = "";

	try
	{
		if (item == null)
		{
			...removed for brevity
			return;
		}

		await this.RegisterReminderAsync(
			ReprocessReminder,
			ObjectToByteArray(item),
			TimeSpan.FromSeconds(0),            // If 0, remind immediately
			TimeSpan.FromMilliseconds(-1));     // Disable periodic firing
	}
	catch (Exception ex)
	{
		error = ex.Message;
	}
	finally
	{
		...removed for brevity
	}
}
``` 
When the reminder triggers, `ReprocessReminder` is called to process the item that was packed within the reminder: `ObjectToByteArray(item)`. Here are possible implementation of packing and unpacking the item:

```csharp
private byte[] ObjectToByteArray(Object obj)
{
    if (obj == null)
        return null;

    BinaryFormatter bf = new BinaryFormatter();

    try
    {
        using (var ms = new MemoryStream())
        {
            bf.Serialize(ms, obj);
            return ms.ToArray();
        }

    }
    catch (Exception ex)
    {
        return null;
    }
}

private Object ByteArrayToObject(byte[] arrBytes)
{
    try
    {
        using (var memStream = new MemoryStream())
        {
            var binForm = new BinaryFormatter();
            memStream.Write(arrBytes, 0, arrBytes.Length);
            memStream.Seek(0, SeekOrigin.Begin);
            var obj = binForm.Deserialize(memStream);
            return obj;
        }
    }
    catch (Exception ex)
    {
        return null;
    }
}
```

### Actor Interface

From this [article](https://azure.microsoft.com/en-us/documentation/articles/service-fabric-reliable-actors-notes-on-actor-type-serialization/): *The arguments of all methods, result types of the tasks returned by each method in an actor interface, and objects stored in an actor's State Manager must be Data Contract serializable. This also applies to the arguments of the methods defined in actor event interfaces. (Actor event interface methods always return void.)* 

In my actor interface, I had many methods and everything was working great until I added these two methods:

```csharp
Task<SomeView> GetView(int year, int month);
Task<SomeView> GetView(int year);
```
If you to compile a Service Fabric solution that has an interface that looks like the above, you will be met with a very strange compilation error:

![Actor Compilation Error](http://i.imgur.com/cO972hG.png)

What? What is that? Why? After hours, it turned out you can actually [turn off](http://stackoverflow.com/questions/35820191/how-to-ignore-a-servicetype-from-servicefabric-manifest-file-on-build-deploy) this error. From the above Stack Overflow post:

By changing the project file .csproj of the project containing the actors and setting property:

```
<UpdateServiceFabricManifestEnabled>false</UpdateServiceFabricManifestEnabled>
```


So this tool can be disabled!! But still why is this happening? It turned out that the actor interfaces may not have overridden methods!! So the tool was complaining about the interface containing just that i.e. overridden methods. If the above interface is changed to the below, everything will work well:

```csharp
Task<SomeView> GetViewByYearNMonth(int year, int month);
Task<SomeView> GetViewByYear(int year);
```

In addition, the actor event methods may not return anything but `void`. So if you have something like this, you will get the same `FabActUtil.exe` error:

```csharp
public interface IMyActorEvents : IActorEvents
{
	Task MeasuresRecalculated(....);
}
```

I am hoping to add to this post as I go along. Hopefully this has been helpful.
 