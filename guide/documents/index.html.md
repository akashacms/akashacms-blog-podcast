---
layout: ebook-page.html.ejs
title: AskashaCMS Blog/Podcast plugin documentation
---

While AkashaCMS is designed to build any website structure, we want it to support building commonly used website structures like Blogs and Podcasts.  What distinguishes a blog or podcast from other website structures is that content items are presented one-by-one in reverse chronological order.  That is, each new blog or podcast posting appears at the front of the list, with each subsequently older post appearing afterward.  There's nothing special about a blog or podcast other than presenting the youngest item first and the use of an RSS (or Atom) feed so subscribers can be notified of new postings.  

This format is very useful in certain cases.  For example a software project like AkashaCMS can use the blog structure to post the latest news about the project.  See: http://akashacms.com/news/index.html  

You may be scratching your head asking what we mean by "blog or podcast".  The two are very similarly structured with one required key difference:  A podcast has an Enclosure tag in its RSS feed.

That is, podcasts are a series of podcast episodes.  Each episode is either an audio or video file, with listeners using a podcast-catcher application to track the episodes.  Those applications subscribe to the podcast RSS feed, with the audio/video file comprising the episode attached using the `enclosure` tag.  The episode "show notes" is simply the text contained within the RSS feed entry.  In other words, a podcast is a blog that distributes multimedia files.

For a working example, see: https://github.com/akashacms/akashacms-blog-skeleton

# Requirements

With that in mind, let's go over the requirements for a blog/podcast AkashaCMS plugin.

* Identifying a group of content files contained in the blog/podcast
* Generate an index page for the blog/podcast -- using River-of-News format
* Generate an RSS file for the blog/podcast
* Support multiple blogs per website

# Configuration

setup
