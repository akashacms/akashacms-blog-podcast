---
layout: plugin-documentation.html.ejs
title: AskashaCMS Blog/Podcast plugin documentation
---

While AkashaCMS is designed to build any website structure, we want it to support building commonly used website structures like Blogs and Podcasts.  What distinguishes a blog or podcast from other website structures is that content items are presented one-by-one in reverse chronological order.  That is, each new blog or podcast posting appears at the front of the list, with each subsequently older post appearing afterward.  There's nothing special about a blog or podcast other than presenting the youngest item first and the use of an RSS (or Atom) feed so subscribers can be notified of new postings.  

This format is very useful in certain cases.  For example a software project like AkashaCMS can use the blog structure to post the latest news about the project.  See: http://akashacms.com/news/index.html  

You may be scratching your head asking what we mean by "blog or podcast".  The two are very similarly structured with one required key difference:  A podcast has an Enclosure tag in its RSS feed.

That is, podcasts are a series of podcast episodes.  Each episode is either an audio or video file, with listeners using a podcast-catcher application to track the episodes.  Those applications subscribe to the podcast RSS feed, with the audio/video file comprising the episode attached using the `enclosure` tag.  The episode "show notes" is simply the text contained within the RSS feed entry.  In other words, a podcast is a blog that distributes multimedia files.

For a working example, see: https://github.com/akashacms/akashacms-blog-skeleton

That example site is auto-built to:  https://blog-skeleton.akashacms.com

# Requirements

With that in mind, let's go over the requirements for a blog/podcast AkashaCMS plugin.

* Identifying a group of content files contained in the blog/podcast
* Generate an index page for the blog/podcast -- using River-of-News format
* Generate an RSS file for the blog/podcast
* Support multiple blogs per website

# Configuration

Assuming you have a working AkashaCMS site, run this command:

```
$ npm install @akashacms/plugins-blog-podcast --save
```

This installs the plugin, and automatically adds it to the `dependencies` in `package.json`

In the `config.js` (again, the AkashaRender style of `config.js`) add this:

```js
config
    ...
    .use(require('@akashacms/plugins-blog-podcast'), {
        bloglist: {
            // blog definitions
        }
    })
    ...
```

That much adds the Blog/Podcast support to AkashaCMS, but does not define any blogs.

The blog-skeleton site has a full working `config.js`:  https://github.com/akashacms/akashacms-blog-skeleton/blob/master/config.js

# Defining a blog

The content for a given blog or podcast is defined by a search through the documents.  The documents matching the search parameters are part of the given blog/podcast.  We'll go over defining the search parameters later.

Remember the `@akashacms/plugins-blog-podcast` plugin supports multiple blog/podcast instances per site.  Each blog/podcast is defined by an object describing its parameters.  The object describes not only the search parameters defining the blog/podcast contents, but also the metadata advertised in the RSS feed.

The plugin only supports RSS, not Atom.  It's unfortunately true that the plugin doesn't actually support Podcasts, because the need hasn't been there to follow through with the intention to support both in the same plugin.

This comes from `akashacms-blog-skeleton`

```js
config
    ...
    .use(require('@akashacms/plugins-blog-podcast'), {
        bloglist: {
            news: {
                rss: {
                    title: "AkashaCMS Example Blog",
                    description: "Skeleton blog for use with AkashaCMS",
                    site_url: "http://blog-skeleton.akashacms.com/blog/index.html",
                    image_url: "http://akashacms.com/logo.gif",
                    managingEditor: 'David Herron',
                    webMaster: 'David Herron',
                    copyright: '2015 David Herron',
                    language: 'en',
                    categories: [ "Node.js", "Content Management System", "HTML5", "Static website generator" ]
                },
                rssurl: "/blog/rss.xml",
                rootPath: "blog",
                matchers: {
                    layouts: [ "blog.html.ejs" ],
                    path: /^blog\//
                }
            }
        }
    })
```

The `options` object for `@akashacms/plugins-blog-podcast` is the list of blogs to be configured for this website.  The `bloglist` object contains entries where the _key_ (in this case `news`) is the _blogtag_, and the value is the configuration for the blog.

The _blogtag_ can be thought of as a short name for the blog.  It is used in several places, such as in the header of articles that are part of the blog.  A document will have this header to identify which blog it is part of:

```yaml
blogtag: news
```

As we said, the content of this object describes the blog.

The `rss` field contains several entries describing the RSS metadata.  This object is passed directly to the `rss` module, see its documentation for more details:  https://www.npmjs.com/package/rss  Notice that it's relatively easy to define the metadata required for a podcast using that module.

The `rssurl` field lists where the RSS file is to land within the website.

The `rootPath` field constrains the document search to a given subtree in the website.  Leaving this off allows any document to be included in the given blog.  If specified, this gives a directory which is the top of the tree that's searched.

The `matchers` field lists options, where matching documents are included in blog.  Either or both of these options can be left out, in which case all documents are included in the blog.  Only those documents matching all the provided matcher options will be included in the blog.  The options are:

* `layouts` Lists one-or-more layout templates.  Presumably one will define a _blog_ template and match on that as shown here.  As the construct implies, you can list several templates in a comma-separated list.  Hence, the `layout` metadata value is used not only to determine the page layout, but to select that this content file is in the blog.
* `path` Is a regular expression to match against the file path.  It's of course another way to get the same effect as the `rootPath` option

Between `rootPath` and `matchers` a subset of the documents in the website will be selected.  It's those documents that make up the blog/podcast.

The RSS file will contain those documents, using a short prefix of each document (from the `teaser` metadata value) rather than the entire document.  The RSS items will be sorted in reverse chronological order, meaning the newest item is listed first.

# Custom tags and Layouts

The `@akashacms/plugins-blog-podcast` plugin provides multiple custom tags that are useful for constructing elements of a blog post or blog index.  The blog-skeleton contains examples of typical page layouts.  You're of course free to develop your own page layout.  

The content documents contained in the blog/podcast must all include one metadata/frontmatter entry, `blogtag`, where the value is the `blogtag` value given above.  Here's an example:

```yaml
---
layout: blog.html.ejs
title: Test Post 1
publicationDate: September 15, 2015
blogtag: news
teaser: This is a blog teaser
---
```

Either the `publicationDate` metadata value, or the timestamp of the document file, is used to determine the ordering of documents within the blog/podcast.

The `blogtag` entry is, as we just said, used to identify which blog this document belongs to.

The `teaser` is what's output in the RSS feed.

## Blog post page

The `blog.html.ejs` template (https://github.com/akashacms/akashacms-blog-skeleton/blob/akasharender/layouts/blog.html.ejs) is meant for formatting a single blog post.  It's a fairly normal page layout but with a couple additions.

```html
<div class="row">
  <section id="breadcrumb" class="col-sm-12">
    <breadcrumb-trail></breadcrumb-trail>
  </section>
</div>
```

It's useful (perhaps) to organize the content documents in a directory structure, where the hierarchy has useful meaning.  In such a case, the `akashacms-breadcrumbs` plugin can give you a useful breadcrumb trail.

```html
<div class="row">
  <section id="category-tags" class="col-sm-12">
    By: <author-link></author-link>;
        <publication-date></publication-date>;
        <tags-for-document/>
  </section>
</div>
```

This is meant to be an attribution line, listing the author, the publication date, and category tags.  A common feature of blogs is "tags".  The `akashacms-tagged-content` plugin makes tagging easy.

```html
<section id="right" class="col-sm-2">
  <tag-cloud/>
</section>
```

That module gives us a useful Tag Cloud (well, it's debatable whether tag clouds are all that useful) we can stick in a sidebar.


```html
<blog-next-prev></blog-next-prev>
```

This tag figures out the "next" and "previous" entries in the blog.  Remember that blogs are sorted in reverse-chronological order, meaning presenting this as a blog means presenting the content in that order.  

The `blog-next-prev` tag lists two links, to the Next and Previous entries in the blog.  That way the reader could read the entire blog by repeatedly clicking on one or the other of those links.  The `blog-next-prev.html.ejs` template is used in case you want to override the presentation.  

```html
<partial file-name='disqus.html'></partial>
```

It's common in blogs to allow readers to leave comments.  AkashaCMS doesn't support commenting natively, however Disqus is a fine system that supports commenting on any kind of website.

## Blog index page

It's useful to have an index page for the blog.  Historically blogs have been presented in the River of News format.  The methodology shown here can present in other formats just by changing the template.

See: https://github.com/akashacms/akashacms-blog-skeleton/blob/akasharender/layouts/index-blog.html.ejs for an example.

```html
<blog-news-river maxentries="100"></blog-news-river>
```

As the name of this tag implies, it produces the River of News format (by default).  Supported attributes are:

* `maxentries` Controls the maximum number of blog entries to show on the index page.
* `template` Changes the template to use.  By default this is `blog-news-river.html.ejs`.  If you want to change the layout, you can either override this template, or you can specify a template using this attribute.


```html
<blog-rss-icon></blog-rss-icon>
```

This tag is meant to be used from the `blog-news-river.html.ejs`, and it shows the RSS icon for the blog.

## Using the blog index elsewhere

The "Blog index page" is one place you might present a blog index.  Such content documents are expected to have a `blogtag` metadata entry.  We also need to show a blog index on pages where there is no `blogtag`.  Sometimes it's necessary to show multiple blog indexes on the same page.

For example the blog-skeleton home page shows two blog indexes, see: https://github.com/akashacms/akashacms-blog-skeleton/blob/akasharender/documents/index.html.md

We do this as follows:

```html
<div id="blog-1-news">
    <div class="well well-sm"><h2>Blog #1</h2></div>
    <blog-news-river maxentries="20" blogtag="news" template="blog-river-thumbs.html.ejs"></blog-news-river>
</div>

<div id="blog-2-news">
    <div class="well well-sm"><h2>Blog #2</h2></div>
    <blog-news-river maxentries="20" blogtag="news-2" template="blog-river-thumbs.html.ejs"></blog-news-river>
</div>
```

Notice that a `blogtag` attribute is given, to specify the blog being displayed.
