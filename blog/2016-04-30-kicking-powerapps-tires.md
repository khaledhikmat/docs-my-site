---
title:  Kicking PowerApps Tires
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [PowerApps]
---

PowerApps is a newly released platform/service to build Line-of-business applications from Microsoft. Reading some documentation and attending some online webcasts, I think the PowerApps product is well positioned for LOB! There is definitely a need to create LOB mobile apps at the enterprise level and distribute them seamlessly without the friction of the app stores.

The thing is that the last two (at least) platforms that Microsoft created to build LOB applications were eventually abandoned i.e. SilverLight and LightSwitch. Hence there could be some resistance from some developers to start learning this new platform knowing that it might also have the same fate as its predecessors. However, from the first couple of hours that I spent on PowerApps, it seems to be a very capable environment and really easy to do stuff in. So I wanted to show off a very simple app that demonstrates some simple but important capabilities. 

Another thing to note is that although, at the time of writing, the product had just made it to public preview from a gated preview, the [documentation](https://powerapps.microsoft.com/en-us/tutorials/getting-started/) looks really complete and actually quite good. There also seems to be strong and engaging community!!
 
### Simple App

I am building an app that presents tabular sales data to users and allows them to drill through the hierarchical nature of the data. For example, at the top level, users will see sales data for different regions and then can drill down to see the sales data for individual countries:

![Hierarchy Sales Data](http://i.imgur.com/Lz0ydEr.png)

So I wanted the ability to navigate to the same screen in PowerApps but with different data. The sample then shows how I solved this particular problem in PowerApps.

### Navigation Scheme

I created two screens: the first is an initial page to present the users certain options and allows them to start viewing the sales data and the second one is the sales data screen that will be navigated to and from in order to view the drill through sales data.

In order to manage the navigation, I created a Stack collection (in PowerApps it is called a collection...but it is like a table) that holds the navigation history of each screen. Upon initial navigation from the initial screen, I clear the collection. When the user drills down, I push (i.e. add) to the collection the screen id of the screen that I just navigated from. When the user drills up, I pop (i.e. remove the last item) from the collection the screen id that I must navigate to. For this app, the only column that I have in this collection is the screen id:

![Navigation Scheme](http://i.imgur.com/Ky1EmUL.png)
  
### Initial Screen

In PowerApps studio, this is how the initial screen looks like:

![Initial Screen](http://i.imgur.com/XKmqkp5.png)

So when the user taps the initial drill down icon, the following script is executed:

```
Clear(Stack); Navigate(Screen2, ScreenTransition.Fade, {Screen:{Id: 1}})
```

This script consists of 3 main things:

- `Clear(Stack);` clears the navigation collection that I named `Stack`.
- `Navigate(Screen2, ScreenTransition.Fade, {Screen:{Id: 1}})` navigates to screen2 (which is the data screen) with a fade
- `{Screen:{Id: 1}}` adds a context variable called `Screen` with a single column called `Id` that contains the value 1 i.e. Level 1   

This [context variable](https://powerapps.microsoft.com/en-us/tutorials/function-updatecontext/) is short-lived as it is only available within the boundary of a single screen. I use it to pass the screen id from one screen to another.

### Data Screen - Drill Down

In PowerApps studio, the data screen drill down looks like this:

![Data Screen Drill Down](http://i.imgur.com/qnQjFwz.png)

So when the user taps the drill down icon, the following script is executed:

```
Collect(Stack, {Id: Screen.Id}); Navigate(Screen2, ScreenTransition.Fade, {Screen:{Id: Last(Stack).Id + 1}})
```

This script consists of 3 main things:

- `Collect(Stack, {Id: Screen.Id});` adds (i.e. collects in PowerApps terminology) the screen id that was passed from the initial screen or the screen that I navigated from. The collection stores the screen ID. 
- `Navigate(Screen2, ScreenTransition.Fade, {Screen:{Id: Last(Stack).Id + 1}})` navigates to the same screen (screen2) with a fade
- `{Screen:{Id: Last(Stack).Id + 1}}` adds a context variable called `Screen` with a single column called `Id` that contains the value of the last item in the Stack i.e. `Last(Stack).Id` plus one! This what makes the context variable so powerful.   

### Data Screen - Drill Up

In PowerApps studio, the data screen drill up looks like this:

![Data Screen Drill Up](http://i.imgur.com/S1buIWP.png)

So when the user taps the drill up icon, the following script is executed:

```
Navigate(Screen2, ScreenTransition.Fade, {Screen:{Id: Last(Stack).Id}}); Remove(Stack, Last( Stack))
```

This script consists of 3 main things:

- `Navigate(Screen2, ScreenTransition.Fade, {Screen:{Id: Last(Stack).Id}});` navigates to the same screen (screen2) with a fade
- `{Screen:{Id: Last(Stack).Id}}` adds a context variable called `Screen` with a single column called `Id` that contains the value of the last item in the Stack i.e. `Last(Stack).Id`. 
- `Remove(Stack, Last( Stack))` removes the last item from the Stack! Effectively we are doing a pop.   

In order to prevent un-supported drill ups, the drill up icon has a visibility property that is controlled by the following script:

```
If (CountRows(Stack) > 0, true)
```  

So as long as there are items in the Stack collection, the drill-up icon is visible. 

I hope this is a helpful short post to show how powerful and useful PowerApps can be. I am hoping to be able to add more posts about PowerApps in future posts.