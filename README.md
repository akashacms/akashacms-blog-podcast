# @akashacms/plugins-blog-podcast
AkashaCMS plugin for blogging and podcasting

This is version 0.10 - intended for compatibility with akasharender@0.10

See http://akashacms.com/new/plugins/blog-podcast/index.html for documentation

A _blog_ is simply a collection of documents (blog posts) that are presented in reverse chronological order, with an associated RSS feed.

This plugin contains functions allowing an AkashaCMS project to contain one or more blogs.  For example, a website for a software project might have two blogs:

1. _Releases_ giving a technical description of the changes in each point release of the product
2. _News_ giving a higher level discussion of the product, its purpose, how it can save lives, improve the health of all mankind, make sure the planets all stay in positive alignment, and so on.

To define a blog, one creates a blog descriptor object.  It serves three purposes:

1. Describes the fields of the RSS feed
2. Gives the URL for the RSS feed
3. Defines a selector that determines which documents in the site are part of the blog

Various elements of blog pages, and blog index pages, are available as extended HTML tags which are meant to be used in page layout templates.

## A note about podcasting

The name of the plugin, blog-podcast, suggests it can be used to support podcasting.  That was aspirational, and has not been implemented.

At the time this plugin was created, a podcast was a series of podcast posts where the RSS feed included tags describing where to find the media file for the podcast episode.  Podcast posts are basically indistinguishable from blog posts except for including a media file (video or audio). That's the type of podcast this plugin aspires to support.  It's hard to understand how one can call a YouTube channel a Podcast.

It was meant to present a podcast as an AkashaCMS blog with these attributes:

* The _show notes_ for a podcase episode would simply be the blog content.  The content would be included in the RSS feed.
* The media file would be rendered on the blog page using an audio or video player
* The RSS feed would have the extended fields required for it to be a podcast feed

However, this was never implemented.  Anyone interested in completing the vision is free to file a pull-request.
