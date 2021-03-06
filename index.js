/**
 * Copyright 2015 David Herron
 *
 * This file is part of AkashaCMS-embeddables (http://akashacms.com/).
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

'use strict';

const path     = require('path');
const util     = require('util');
const url      = require('url');
const akasha   = require('akasharender');
const mahabhuta = akasha.mahabhuta;

const pluginName = "@akashacms/plugins-blog-podcast";

const _plugin_config = Symbol('config');
const _plugin_options = Symbol('options');

module.exports = class BlogPodcastPlugin extends akasha.Plugin {
    constructor() { super(pluginName); }

    configure(config, options) {
        this[_plugin_config] = config;
        this[_plugin_options] = options;
        options.config = config;
		config.addPartialsDir(path.join(__dirname, 'partials'));
        config.addMahabhuta(module.exports.mahabhutaArray(options));
        if (!options.bloglist) options.bloglist = [];
	}

    get config() { return this[_plugin_config]; }
    get options() { return this[_plugin_options]; }

    addBlogPodcast(config, name, blogPodcast) {
        this.options.bloglist[name] = blogPodcast;
        return this.config;
    }

    isLegitLocalHref(config, href) {
        // console.log(`isLegitLocalHref ${util.inspect(this.options.bloglist)} === ${href}?`);
        for (var blogkey in this.options.bloglist) {
            var blogcfg = this.options.bloglist[blogkey];
            // console.log(`isLegitLocalHref ${blogcfg.rssurl} === ${href}?`);
            if (blogcfg.rssurl === href) {
                return true;
            }
        }
        return false;
    }

    async onSiteRendered(config) {
        const plugin = this;
        const tasks = [];
        for (var blogkey in this.options.bloglist) {
            if (!this.options.bloglist.hasOwnProperty(blogkey)) {
                continue;
            }
            var blogcfg = this.options.bloglist[blogkey];
            tasks.push(blogcfg);
        }
        await Promise.all(tasks.map(async blogcfg => {
            // console.log(`blog-podcast blogcfg ${util.inspect(blogcfg)}`);
            const taskStart = new Date();
            var documents = await plugin.findBlogDocs(config, blogcfg);
            var count = 0;
            var documents2 = documents.filter(doc => {
                if (typeof blogcfg.maxEntries === "undefined"
                || (typeof blogcfg.maxEntries !== "undefined" && count++ < blogcfg.maxEntries)) {
                    return true;
                } else return false;
            });
            // console.log('blog-news-river documents2 '+ util.inspect(documents2));

            var rssitems = documents2.map(doc => {
                let u = new URL(config.root_url);
                // Accommodate when root_url is something like
                //   http://example.com/foo/bar/
                // This generates a URL for the blog entry that includes the
                // domain for the website.  But in some cases the generated 
                // content lands in a subdirectory.
                u.pathname = path.normalize(path.join(u.pathname, doc.renderpath));
                // console.log(`rss item ${config.root_url} ${doc.renderpath} ==> ${u.toString()}`);
                return {
                    title: doc.metadata.title,
                    description: doc.metadata.teaser ? doc.metadata.teaser : "",
                    url: u.toString(),
                    date: doc.metadata.publicationDate ? doc.metadata.publicationDate : doc.stat.mtime
                };
            });

            var maxItems;
            if (typeof blogcfg.maxItems === 'undefined') {
                maxItems = 60;
            } else if (blogcfg.maxItems <= 0) {
                maxItems = undefined;
            } else {
                maxItems = blogcfg.maxItems;
            }

            if (maxItems) {
                let rssitems2 = [];
                let count = 0;
                for (let item of rssitems) {
                    if (count < maxItems) {
                        rssitems2.push(item);
                        // console.log(`${blogkey} PUSH ITEM ${count} ${util.inspect(item)}`);
                    }
                    count++;
                }
                rssitems = rssitems2;
            }

            // console.log(`GENERATE RSS rssitems # ${rssitems.length} maxItems ${maxItems} ${util.inspect(blogcfg)} `);

            // console.log(`GENERATE RSS ${config.renderDestination + blogcfg.rssurl} ${util.inspect(rssitems)}`);

            let feed_url = new URL(config.root_url);
            feed_url.pathname = path.normalize(path.join(feed_url.pathname, blogcfg.rssurl));
            // console.log(`generateRSS ${config.root_url} ${blogcfg.rssurl} ==> ${feed_url.toString()}`);
            await akasha.generateRSS(config, blogcfg, {
                    feed_url: feed_url.toString(),
                    pubDate: new Date()
                },
                rssitems, blogcfg.rssurl);

            const taskEnd = new Date();

            console.log(`GENERATED RSS ${feed_url.toString()} rssitems # ${rssitems.length} in ${(taskEnd - taskStart) / 1000}`)
        }));
    }

    /**
     *
        blogPodcast: {
            "news": {
                rss: {
                    title: "AkashaCMS News",
                    description: "Announcements and news about the AkashaCMS content management system",
                    site_url: "http://akashacms.com/news/index.html",
                    image_url: "http://akashacms.com/logo.gif",
                    managingEditor: 'David Herron',
                    webMaster: 'David Herron',
                    copyright: '2015 David Herron',
                    language: 'en',
                    categories: [ "Node.js", "Content Management System", "HTML5", "Static website generator" ]
                },
                rssurl: "/news/rss.xml",
                matchers: {
                    layouts: [ "blog.html.ejs" ],
                    path: /^news\//
                }
            },

            "howto": {
                rss: {
                    title: "AkashaCMS Tutorials",
                    description: "Tutorials about using the AkashaCMS content management system",
                    site_url: "http://akashacms.com/howto/index.html",
                    image_url: "http://akashacms.com/logo.gif",
                    managingEditor: 'David Herron',
                    webMaster: 'David Herron',
                    copyright: '2015 David Herron',
                    language: 'en',
                    categories: [ "Node.js", "Content Management System", "HTML5", "HTML5", "Static website generator" ]
                },
                rssurl: "/howto/rss.xml",
                matchers: {
                    layouts: [ "blog.html.ejs" ],
                    path: /^howto\//
                }
            }
        },
    *
    */
    async findBlogDocs(config, blogcfg) {

        if (!blogcfg || !blogcfg.matchers) {
            throw new Error(`findBlogDocs no blogcfg`);
        }

        var documents = await akasha.documentSearch(config, {
            // rootPath: docDirPath,
            pathmatch: blogcfg.matchers.path ? blogcfg.matchers.path : undefined,
            renderers: [ akasha.HTMLRenderer ],
            layouts: blogcfg.matchers.layouts ? blogcfg.matchers.layouts : undefined,
            rootPath: blogcfg.rootPath ? blogcfg.rootPath : undefined
        });

        // for (let document of documents) {
        //    console.log(`findBlogDocs blog doc ${document.docpath} ${document.metadata.layout} ${document.metadata.publicationDate}`);
        // }

        // console.log('findBlogDocs '+ util.inspect(documents));
        let dateErrors = [];
        documents.sort((a, b) => {
            let publA = a.metadata.publicationDate ? a.metadata.publicationDate : a.stat.mtime;
            let aPublicationDate = Date.parse(publA);
            if (isNaN(aPublicationDate)) {
                dateErrors.push(`findBlogDocs ${a.renderpath} BAD DATE publA ${publA}`);
            }
            let publB = b.metadata.publicationDate ? b.metadata.publicationDate : b.stat.mtime;
            let bPublicationDate = Date.parse(publB);
            // console.log(`findBlogDocs publA ${publA} aPublicationDate ${aPublicationDate} publB ${publB} bPublicationDate ${bPublicationDate}`);
            if (isNaN(bPublicationDate)) {
                dateErrors.push(`findBlogDocs ${b.renderpath} BAD DATE publB ${publB}`);
            }
            if (aPublicationDate < bPublicationDate) return -1;
            else if (aPublicationDate === bPublicationDate) return 0;
            else return 1;
        });
        if (dateErrors.length >= 1) {
            throw dateErrors;
        }
        // for (let document of documents) {
        //    console.log(`findBlogDocs blog doc sorted  ${document.docpath} ${document.metadata.layout} ${document.metadata.publicationDate}`);
        // }
        documents.reverse();
        // for (let document of documents) {
        //    console.log(`findBlogDocs blog doc reversed  ${document.docpath} ${document.metadata.layout} ${document.metadata.publicationDate}`);
        // }

        return documents;
    }

    async findBlogIndexes(config, blogcfg) {
        if (!blogcfg.indexmatchers) return [];

        return await akasha.documentSearch(config, {
            pathmatch: blogcfg.indexmatchers.path ? blogcfg.indexmatchers.path : undefined,
            renderers: [ akasha.HTMLRenderer ],
            layouts: blogcfg.indexmatchers.layouts ? blogcfg.indexmatchers.layouts : undefined,
            rootPath: blogcfg.rootPath ? blogcfg.rootPath : undefined
        });
    }

}

module.exports.mahabhutaArray = function(options) {
    let ret = new mahabhuta.MahafuncArray(pluginName, options);
    ret.addMahafunc(new BlogNewsRiverElement());
    ret.addMahafunc(new BlogRSSIconElement());
    ret.addMahafunc(new BlogRSSLinkElement());
    ret.addMahafunc(new BlogRSSListElement());
    ret.addMahafunc(new BlogNextPrevElement());
    ret.addMahafunc(new BlogNewsIndexElement());
    return ret;
};


class BlogNewsRiverElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-news-river"; }
    async process($element, metadata, dirty) {
        var blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            console.error("NO BLOG TAG in blog-news-river"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-news-river"+ metadata.document.path);
        }

        // log('blog-news-river '+ blogtag +' '+ metadata.document.path);

        var blogcfg = this.array.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        var _blogcfg = {};
        for (var key in blogcfg) {
            _blogcfg[key] = blogcfg[key];
        }

        var maxEntries = $element.attr('maxentries');

        var template = $element.attr("template");
        if (!template) template = "blog-news-river.html.ejs";

        var rootPath = $element.attr('root-path');
        if (rootPath) {
            _blogcfg.rootPath = rootPath;
        }

        var docRootPath = $element.attr('doc-root-path');
        if (docRootPath) {
            _blogcfg.rootPath = path.dirname(docRootPath);
        }

        var documents = await this.array.options.config.plugin(pluginName).findBlogDocs(this.array.options.config, _blogcfg);

        // log('blog-news-river documents '+ util.inspect(documents));

        var count = 0;
        var documents2 = documents.filter(doc => {
            if (typeof maxEntries === "undefined"
            || (typeof maxEntries !== "undefined" && count++ < maxEntries)) {
                return true;
            } else return false;
        });
        // log('blog-news-river documents2 '+ util.inspect(documents2));

        return akasha.partial(this.array.options.config, template, {
            documents: documents2,
            feedUrl: _blogcfg.rssurl
        });
    }
}

class BlogNewsIndexElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-news-index"; }
    async process($element, metadata, dirty) {
        var blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            console.error("NO BLOG TAG in blog-news-index"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-news-index "+ metadata.document.path);
        }

        var blogcfg = this.array.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        var template = $element.attr("template");
        if (!template) template = "blog-news-indexes.html.ejs";

        let indexDocuments = await this.array.options.config.plugin(pluginName).findBlogIndexes(this.array.options.config, blogcfg);
        return akasha.partial(this.array.options.config, template, { indexDocuments });
    }
}

class BlogRSSIconElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-rss-icon"; }
    process($element, metadata, dirty) {
        var blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            console.error("NO BLOG TAG in blog-rss-icon"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-rss-icon"+ metadata.document.path);
        }
        var title = $element.attr("title");

        var blogcfg = this.array.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        var template = $element.attr("template");
        if (!template) template = "blog-rss-icon.html.ejs";

        return akasha.partial(this.array.options.config, template, {
            feedUrl: blogcfg.rssurl,
            title: title
        });
    }
}

class BlogRSSLinkElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-rss-link"; }
    process($element, metadata, dirty) {
        var blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            console.error("NO BLOG TAG in blog-rss-link"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-rss-link"+ metadata.document.path);
        }

        var blogcfg = this.array.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        var template = $element.attr("template");
        if (!template) template = "blog-rss-link.html.ejs";

        return akasha.partial(this.array.options.config, template, {
            feedUrl: blogcfg.rssurl
        });
    }
}

class BlogRSSListElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-feeds-all"; }
    process($element, metadata, dirty) {
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "blog-feeds-all.html.ejs";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
        dirty();
        return akasha.partial(this.array.options.config, template, {
            id, additionalClasses,
            bloglist: this.array.options.bloglist
        });
    }
}

class BlogNextPrevElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-next-prev"; }
    async process($element, metadata, dirty) {
        if (! metadata.blogtag) { return; }
        let blogcfg = this.array.options.bloglist[metadata.blogtag];
        if (!blogcfg) throw new Error(`No blog configuration found for blogtag ${metadata.blogtag} in ${metadata.document.path}`);

        let docpathNoSlash = metadata.document.path.startsWith('/') ? metadata.document.path.substring(1) : metadata.document.path;
        let documents = await this.array.options.config.plugin(pluginName).findBlogDocs(this.array.options.config, blogcfg);

        let docIndex = -1;
        for (var j = 0; docIndex === -1 && j < documents.length; j++) {
            let document = documents[j];
            // console.log(`blog-next-prev findBlogDocs blogtag ${util.inspect(metadata.blogtag)} found ${document.basedir} ${document.docpath} ${document.docfullpath} ${document.renderpath}  MATCHES? ${docpathNoSlash}  ${metadata.document.path}`);
            if (path.normalize(document.docdestpath) === path.normalize(docpathNoSlash)) {
                docIndex = j;
            }
        }
        if (docIndex >= 0) {
            let prevDoc = docIndex === 0 ? documents[documents.length - 1] : documents[docIndex - 1];
            let nextDoc = docIndex === documents.length - 1 ? documents[0] : documents[docIndex + 1];
            let html = await akasha.partial(this.array.options.config, 'blog-next-prev.html.ejs', {
                prevDoc, nextDoc
            });
            return html;
        } else {
            // console.error(`blog-next-prev did not find document ${docpathNoSlash} ${metadata.document.path} in blog`);
            throw new Error(`did not find document ${docpathNoSlash} ${metadata.document.path} in blog`);
        }
    }
}
