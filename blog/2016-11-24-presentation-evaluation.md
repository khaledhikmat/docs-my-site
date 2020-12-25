---
title:  Xamarin Forms App using VS for mac
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Xamarin]
---

I am new to Xamarin development and I also wanted to try the newly announced VS for mac! So I created a little Camera app that can be used to evaluate presentations. The app allows the user to take a `selfie`. When committed, the picture is sent to an Azure cognitive function to extract the gender, male and smile (a measure of emotion). The app then displays the taken picture and returned result in the app. It also sends the result to PowerBI real-time stream to allow the visualization of the evaluation results.

So in essence, a user uses the app to take a selfie with a smile or a frown to indicate whether the presentation was good, not so good or somewhere in between. For example, if the user submitted a picture that looks like this:

![Evaluation](http://i.imgur.com/QPF0LI8.png)

The cognitive result might look like this:

![Cognitive Result](http://i.imgur.com/0U4IaRH.png)

and the result will be pushed in real-time to a PowerBI dashboard:

![PowerBI](http://i.imgur.com/XvnGaVs.png)

## Xamarin App

### Taking a Camera picture

Using VS for mac, I created a blank XAML forms app solution with Android and iOS. Added the following Xamarin plugin to all of its projects (portable, iOS and Droid):

- Xam.Plugin.Media

This allows me to use the Camera without having to deal with iOs or Android. I wrote the following simple XAML in the main page:

```
<?xml version="1.0" encoding="utf-8"?>
<ContentPage xmlns="http://xamarin.com/schemas/2014/forms" 
		xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml" 
		xmlns:local="clr-namespace:PresentationEvaluation" 
		x:Class="PresentationEvaluation.PresentationEvaluationPage">
	<StackLayout>
		<Button x:Name="btnTakePicture" Clicked="btnTakePicture_Clicked" Text="Take selfie with emotion"/>
		<ActivityIndicator x:Name="Indicator" Color="Black"/>
		<StackLayout x:Name="ResultPanel" Padding="10">
			<Image x:Name="Image" HeightRequest="240" />
	        <StackLayout x:Name="Age" Orientation="Horizontal">
	            <Label>Age</Label>
	            <Label x:Name="AgeData"></Label>
	        </StackLayout>
	        <StackLayout x:Name="Gender" Orientation="Horizontal">
	            <Label>Gender</Label>
	            <Label x:Name="GenderData"></Label>
	        </StackLayout>
	        <StackLayout x:Name="Smile" Orientation="Horizontal">
	            <Label>Smile</Label>
	            <Label x:Name="SmileData"></Label>
	        </StackLayout>
	        <Label x:Name="Result"></Label>
		</StackLayout>
	</StackLayout>
</ContentPage>
```
and I had this in the behind code:

```csharp
namespace PresentationEvaluation
{
	public partial class PresentationEvaluationPage : ContentPage
	{
		public PresentationEvaluationPage()
		{
			InitializeComponent();
			ResultPanel.IsVisible = false;
		}

		private async void btnTakePicture_Clicked(object sender, EventArgs e)
		{
			try
			{
				await CrossMedia.Current.Initialize();

				if (!CrossMedia.Current.IsCameraAvailable || !CrossMedia.Current.IsTakeVideoSupported)
					throw new Exception($"There is no camera on the device!");

				var file = await CrossMedia.Current.TakePhotoAsync(new Plugin.Media.Abstractions.StoreCameraMediaOptions
				{
					SaveToAlbum = true,
					Name = "SelfieEvaluation.jpg"
				});

				if (file == null)
					throw new Exception($"Picture not captured to disk!!");

				Image.Source = ImageSource.FromStream(() => file.GetStream());

				//TODO: Do something with the image 
			}
			catch (Exception ex)
			{
				await DisplayAlert("Sorry", "An error occurred: " + ex.Message, "Ok");
			}
			finally
			{
			}
		}
	}
}
```

### Communicating with Cognitive

Now that we got the picture from the Camera, I wanted to send it to Azure Cognitive to detect the age, gender and smile. I added some NuGet packages:

- Microsoft.Net.Http
- Newton.Json

First I had to convert the media image file to an array of bytes:

```csharp
public static byte[] GetBytes(MediaFile file)
{
	byte[] fileBytes = null;
	using (var ms = new MemoryStream())
	{
		file.GetStream().CopyTo(ms);
		file.Dispose();
		fileBytes = ms.ToArray();
	}

	return fileBytes;
}
```
Then submitted to the congnitive APIs:

```csharp
		byte[] picture = GetBytes(file);

		float age = -1;
		string gender = "";
		float smile = -1;

		// Submit to Cognitive
		using (var httpClient = new HttpClient())
		{
			httpClient.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", "get-your-own");
			HttpResponseMessage response;
			var content = new ByteArrayContent(picture);
			content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
			response = await httpClient.PostAsync(FacialApi, content);
			string responseData = await response.Content.ReadAsStringAsync();
			if (!response.IsSuccessStatusCode)
				throw new Exception($"Unable to post to cognitive service: {response.StatusCode.ToString()}");

			Face[] faces = JsonConvert.DeserializeObject<Face[]>(responseData);
			if (faces != null && faces.Length > 0)
			{
				Face face = faces[0];
				age = face.faceAttributes.age;
				gender = face.faceAttributes.gender;
				smile = face.faceAttributes.smile;
			}
		}
```
Where the Face classes are defined as follows (I just special pasted the docs JSON example into my Visual Studio to create these classes):

```csharp
public class Face
{
	public string faceId { get; set; }
	public Facerectangle faceRectangle { get; set; }
	public Faceattributes faceAttributes { get; set; }
	public string glasses { get; set; }
	public Headpose headPose { get; set; }
}

public class Facerectangle
{
	public int width { get; set; }
	public int height { get; set; }
	public int left { get; set; }
	public int top { get; set; }
}

public class Faceattributes
{
	public float age { get; set; }
	public string gender { get; set; }
	public float smile { get; set; }
	public Facialhair facialHair { get; set; }
}

public class Facialhair
{
	public float mustache { get; set; }
	public float beard { get; set; }
	public float sideburns { get; set; }
}

public class Headpose
{
	public float roll { get; set; }
	public int yaw { get; set; }
	public int pitch { get; set; }
}
``` 

Because I have a free cognitive account and I could be throttled, I created a randomizer to generate random values in case i don't wato to use the cognitive functions for testing. So I created a flag that I can change whenever I want to test without cognitive:

```csharp
// Submit to Cognitive
if (IsCognitive)
{
	///same as above
	...
}
else
{
	gender = genders.ElementAt(random.Next(genders.Count - 1));
	age = ages.ElementAt(random.Next(ages.Count - 1));
	smile = smiles.ElementAt(random.Next(smiles.Count - 1));
}
```

### PowerBI

Once I get the result back from the cognitive function, I create a real time event (and refer to the smile range as score after I multiply it by 10) and send it to [PowerBI real-time](https://powerbi.microsoft.com/en-us/documentation/powerbi-service-real-time-streaming/) very useful feature which displays visualizations in real-time:

```csharp
using (var httpClient = new HttpClient())
{
	var realTimeEvent = new
	{
		time = DateTime.Now,
		age = (int)age,
		score = (int)(smile * 10),
		gender = gender
	};

	var data = new dynamic[1];
	data[0] = realTimeEvent;
	var postData = JsonConvert.SerializeObject(data);
	HttpContent httpContent = new StringContent(postData, Encoding.UTF8, "application/json");
	HttpResponseMessage response = await httpClient.PostAsync(PowerBIApi, httpContent);
	string responseString = await response.Content.ReadAsStringAsync();

	if (!response.IsSuccessStatusCode)
		throw new Exception("Unable to post to PowerBI: " + response.StatusCode);
}
```

where PowerBIApi is the real-time API that you must post it. You will get this from PowerPI service when you create your own Real-Time dataset.

This allows people to watch the presentation evaluation result in real-time:

![PowerBI](http://i.imgur.com/XvnGaVs.png)

That was a nice exercise! I liked the ease of developing stuff in Xamarin forms as it shields me almost completely from Android and iOS. Visual Studio for mac (in preview), however, has a lot of room of improvement...it feels heavy, clunky and a bit buggy. Finally I would like to say that, in non-demo situations, it is probably better to send the picture to an Azure storage which will trigger an Azure Function that will send to cognitive and PowerBI. 

The code is available in GitHub [here](https://github.com/khaledhikmat/presentation-evaluation)