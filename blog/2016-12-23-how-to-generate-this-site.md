---
title:  How to generate a static site using Wyam
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Wyam]
---

I use [Wyam](https://wyam.io/) to statically generate this site. This is to document the steps I take to run [Wyam](https://wyam.io/) locally, test my posts and push the site to [GitHub](https://www.github.com):

I have a directory structure that looks like this:

![Wyam Dir Structure](https://mosaicapi.blob.core.windows.net/images/1788cf26-c285-4f7b-b9ad-da65f73574b6.png)

The `Input` directory looks like this:

![Wyam input Dir Structure](https://mosaicapi.blob.core.windows.net/images/5cbc7cab-bd19-4e81-af36-ce2b8cb3157c.png)
 

I place my posts in `Markdown` in the `posts` directory.

The `run.cmd` contains the following:

```
@echo off
..\..\Wyam-Exec\Wyam-v0.15.1-beta\Wyam.exe -r Blog -t CleanBlog -pw
```

This assumes that:
- I have `Wyam-Exec` directory two directories above my blog directory 
- I have different Wyam versions I can test with. For example, I am using a beta version here

The `config.wyam` contains the following:

```
Settings.Host = "khaledhikmat.github.io";
GlobalMetadata["Title"] = "Khaled Hikmat";
GlobalMetadata["Description"] = "Coding Thoughts";
GlobalMetadata["Intro"] = "Software old timer";
GlobalMetadata["Image"] = "images/liquid.jpg";
```

This drives the site's metadata.

While I am in my blog directory, I open up a command box and type:

```
cmd
```

This starts Wyam, launches its internal web site listening on port 5080 and it also monitors the input directory for any changes. I add my blogs, edit them and test locally using the 5080 site. 

Once I am satisfied, I copy the content of the `output` directory:

![Wyam output Dir Structure](https://mosaicapi.blob.core.windows.net/images/949ce5de-3540-460f-ae44-b82ae6bda923.png)

and paste it into my site [GitHub pages](https://pages.github.com/) structure and replace all files. To publish to GitHub, I issue the following `git` commands:

```
git add --all
git commit -am "Added/Edited new/existing posts"
git push
``` 

This publishes my changes to [GitHub pages](https://pages.github.com/). 
