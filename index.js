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

const fs       = require('fs/promises');
const path     = require('path');
const util     = require('util');
const url      = require('url');
const akasha   = require('akasharender');
const mahabhuta = akasha.mahabhuta;

const pluginName = "@akashacms/plugins-blog-podcast";

const _plugin_config = Symbol('config');
const _plugin_options = Symbol('options');
const _plugin_views = Symbol('views');

module.exports = class BlogPodcastPlugin extends akasha.Plugin {
    constructor() { super(pluginName); }

    configure(config, options) {
        this[_plugin_config] = config;
        this[_plugin_options] = options;
        // Possible place to store ForerunnerDB views
        // this[_plugin_views] = {};
        options.config = config;
		config.addPartialsDir(path.join(__dirname, 'partials'));
        config.addMahabhuta(module.exports.mahabhutaArray(options));
        if (!options.bloglist) options.bloglist = [];
	}

    get config() { return this[_plugin_config]; }
    get options() { return this[_plugin_options]; }

    blogcfg(tag) { return this.options.bloglist[tag]; }

    isBlogtag(tag) {
        let type = typeof this.options.bloglist[tag];
        return type !== 'undefined' && type === 'object';
    }

    addBlogPodcast(config, name, blogPodcast) {
        this.options.bloglist[name] = blogPodcast;
        return this.config;
    }

    /*
     * For future - to implement ForerunnerDB views
    viewInfo(tag) {
        if (!this.isBlogtag(tag)) throw new Error(`viewInfo INVALID BLOGTAG ${tag}`);
        if (!this[_plugin_views][tag]) {
            this[_plugin_views][tag] = {};
        }
        return this[_plugin_views][tag];
    }
    */

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

    get cacheIndexes() {
        return {
            documents: {
                docMetadata: {
                    blogtag: 1
                }
            },
            assets: undefined,
            layouts: undefined,
            partials: undefined,
        };
    }

    findBlogForVPInfo(vpinfo) {
        for (var blogkey in this.options.bloglist) {
            var blogcfg = this.options.bloglist[blogkey];
            // console.log(`findBlogForVPInfo ${vpinfo.vpath} in ${blogkey}`);
            if (this.isVPathInBlog(blogcfg, vpinfo)) {
                // console.log(`YES findBlogForVPInfo ${vpinfo.vpath} in ${blogkey}`);
                return { blogkey, blogcfg };
            }
        }
        // console.log(`findBlogForVPInfo ${vpinfo.vpath} no blog`);
        return undefined;
    }

    isVPathInBlog(cfg, info) {
        if (!info.renderPath.match(/\.html$/)) return false;
        if (cfg.matchers) {
            if (cfg.matchers.layouts
             && Array.isArray(cfg.matchers.layouts)
             && cfg.matchers.layouts.length > 0) {
                // console.log(`isVPathInBlog ${info.vpath} layouts `, cfg.matchers.layouts);
                if (info.docMetadata
                 && info.docMetadata.layout) {
                    // console.log(`isVPathInBlog ${info.vpath} is ${info.docMetadata.layout} in `, cfg.matchers.layouts);
                    let matchedLayout = false;
                    for (let layout of cfg.matchers.layouts) {
                        if (layout === info.docMetadata.layout) {
                            matchedLayout = true;
                        }
                    }
                    if (!matchedLayout) return false;
                }
            }/* else {
                console.log(`isVPathInBlog ${info.vpath} NO LAYOUT MATCHERS`);
            } */
            if (cfg.matchers.renderpath) {
                if (!info.renderPath.match(cfg.matchers.renderpath)) return false;
            }
            if (cfg.matchers.path) {
                if (!info.vpath.match(cfg.matchers.path)) return false;
            }
            if (cfg.matchers.glob) {
                if (!info.vpath.match(cfg.matchers.glob)) return false;
            }
            if (cfg.rootPath) {
                if (!info.renderPath.startsWith(cfg.rootPath)) return false;
            }
        }/* else {
            console.log(`isVPathInBlog ${info.vpath} NO MATCHERS`);
        } */
        return true;
    }

    async onSiteRendered(config) {
        const plugin = this;
        const tasks = [];
        for (var blogkey in this.options.bloglist) {
            if (!this.options.bloglist.hasOwnProperty(blogkey)) {
                continue;
            }
            var blogcfg = this.options.bloglist[blogkey];
            tasks.push({ blogkey, blogcfg });
        }
        await Promise.all(tasks.map(async data => {
            const blogkey = data.blogkey;
            const blogcfg = data.blogcfg;
            // console.log(`blog-podcast blogcfg ${util.inspect(blogcfg)}`);
            const taskStart = new Date();
            var documents = await plugin.findBlogDocs(config, blogcfg, blogkey);
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
                u.pathname = path.normalize(
                        path.join('/', doc.renderPath));
                // console.log(`rss item ${config.root_url} ${doc.renderpath} ==> ${u.toString()}`);
                return {
                    title: doc.docMetadata.title,
                    description: doc.docMetadata.teaser
                            ? doc.docMetadata.teaser : "",
                    url: u.toString(),
                    date: doc.docMetadata.publicationDate
                            ? doc.docMetadata.publicationDate
                            : doc.stat.mtime
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
            feed_url.pathname = path.normalize(
                    path.join(feed_url.pathname, blogcfg.rssurl));
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
    async findBlogDocs(config, blogcfg, blogtag) {

        if (!this.isBlogtag(blogtag)) {
            throw new Error(`findBlogDocs given invalid blogtag ${blogtag}`);
        }

        if (akasha !== config.akasha) {
            console.error(`findBlogDocs akasha !== config.akasha`);
        }

        // Performance testing
        // const _start = new Date();

        if (!blogcfg || !blogcfg.matchers) {
            throw new Error(`findBlogDocs no blogcfg`);
        }

        const selector = {};

        selector.rendersToHTML = blogcfg.matchers.rendersToHTML;

        if (blogcfg.matchers && blogcfg.matchers.path) {
            selector.pathmatch = blogcfg.matchers.path;
        }

        if (blogcfg.matchers && blogcfg.matchers.renderpath) {
            selector.renderpathmatch = blogcfg.matchers.renderpath;
        }

        // The rootPath option is used as an alternative for selecting
        // blog entries within a directory hierarchy.  One use is
        // to select the blog posts under a given location within
        // a blog hierarchy.  For example, an index page a couple levels
        // down within the blog should only list the items in that directory
        // and below.
        //
        // Hence, rootPath is a simple string, but we treat it as
        // a RegExp like:  /^rootPath/  .. this way the test is at
        // the beginning of the string.

        if (blogcfg.rootPath) {
            if (selector.renderpathmatch) {
                const m = selector.renderpathmatch;
                selector.renderpathmatch = [
                    m, `^${blogcfg.rootPath}`
                ];
            } else {
                selector.renderpathmatch = `^${blogcfg.rootPath}`;
            }
        }

        // What's the point of rootPath when the same can
        // be handled with renderPath?

        /* if (typeof blogcfg.rootPath === 'string'
         && blogcfg.rootPath !== '') {
            // There might have been a 'matchers.renderpath' in which case
            // we want to convert it into a $and clause to match both.
            // console.log(`blogSelector blogcfg.rootPath ${blogcfg.rootPath}`);
            const rootPathMatch = `^${blogcfg.rootPath}`;
            if (selector.renderPath) {
                const renderPathMatch = selector.renderPath;
                delete selector.renderPath;
                selector['$and'] = [
                    { renderPath: { '$regex': renderPathMatch } },
                    { renderPath: { '$regex': rootPathMatch } }
                ];
            } else {
                selector.renderPath = {
                    '$regex': rootPathMatch
                }
            }
        } */


        if (blogcfg.matchers && blogcfg.matchers.layouts) {
            if (Array.isArray(blogcfg.matchers.layouts)) {
                selector.layouts = blogcfg.matchers.layouts;
            } else if (typeof blogcfg.matchers.layouts === 'string') {
                selector.layouts = [ blogcfg.matchers.layouts ];
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.layouts ${util.inspect(blogcfg.matchers.layouts)}`);
            }
        }

        selector.filterfunc = (config, options, doc) => {
            if (doc.docMetadata
             && doc.docMetadata.blogtag) {
                // This could possibly be in a blog, but not in this blog
                // console.log(`blog podcast filterfunc ${doc.vpath} ${util.inspect(options.blogtag)} ${util.inspect(doc?.docMetadata?.blogtag)}`);
                if (Array.isArray(options.blogtags)
                 && !options.blogtags.includes(doc.docMetadata.blogtag)) {
                    // console.log(`findBlogDocs filterfunc ${doc.metaData.blogtag} not in ${util.inspect(options.blogtags)} ${doc.vpath}`);
                    return false;
                } else if (typeof options.blogtags === 'string'
                 && doc.docMetadata.blogtag !== options.blogtags) {
                    // console.log(`findBlogDocs filterfunc ${doc.metaData.blogtag} not in ${options.blogtags} ${doc.vpath}`);
                    return false;
                }
            } else if (!doc.docMetadata || !doc.docMetadata.blogtag) {
                // This cannot be in any blog
                // console.log(`findBlogDocs filterfunc NOT IN ANY BLOG ${doc.vpath}`)
                return false;
            }
            return true;
        };

        let dateErrors = [];
        /* selector.sortFunc = async (a, b) => {
            let aPublicationTime = new Date(a.publicationDate).getTime();
            if (isNaN(aPublicationTime)) {
                dateErrors.push(`findBlogDocs ${a.vpath} BAD DATE ${aPublicationTime}`);
            }

            let bPublicationTime = new Date(b.publicationDate).getTime();
            console.log(`findBlogDocs ${a.vpath} ${aPublicationTime} ${b.vpath} ${bPublicationTime}`);
            if (isNaN(bPublicationTime)) {
                dateErrors.push(`findBlogDocs ${b.vpath} BAD DATE ${bPublicationTime}`);
            }
            if (aPublicationTime < bPublicationTime) return -1;
            else if (aPublicationTime === bPublicationTime) return 0;
            else return 1;
        }; */

        selector.sortBy = 'publicationTime';
        selector.sortByDescending = true;
        // selector.reverse = true;

        if (typeof blogcfg.maxEntries === 'number'
         && blogcfg.maxEntries > 0) {
            selector.limit = blogcfg.maxEntries;
        }

        if (typeof blogcfg.startAt === 'number'
         && blogcfg.startAt >= 0) {
            selector.offset = blogcfg.startAt;
        }

        // console.log(selector);

        // console.log(filecache);
        // console.log(await config.documentsCache());
        
        let documents = (await config.documentsCache()).search(selector);
        
        if (dateErrors.length >= 1) {
            throw dateErrors;
        } 

        // Performance testing
        // console.log(`findBlogDocs ${blogtag} options setup ${(new Date() - _start) / 1000} seconds`);


        // Performance testing
        // console.log(`findBlogDocs ${blogtag} after searching ${_documents.length} documents ${(new Date() - _start) / 1000} seconds`);

        return documents;
    }

    async findBlogIndexes(config, blogcfg) {
        if (!blogcfg.indexmatchers) return [];

        const filecache = await this.akasha.filecache;
        return filecache.search({
            rendersToHTML: true,
            sortBy: 'publicationTime',
            sortByDescending: true,
            limit: blogcfg.maxEntries ? blogcfg.maxEntries : undefined,
            // reverse: true,
            pathmatch: blogcfg.indexmatchers.path ? blogcfg.indexmatchers.path : undefined,

            // glob: '**/*.html',
            layouts: blogcfg.indexmatchers.layouts ? blogcfg.indexmatchers.layouts : undefined,
            rootPath: blogcfg.rootPath ? blogcfg.rootPath : undefined,
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
        // const _start = new Date();
        let blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            console.error("NO BLOG TAG in blog-news-river"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-news-river"+ metadata.document.path);
        }

        // log('blog-news-river '+ blogtag +' '+ metadata.document.path);

        let blogcfg = this.array.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        // console.log(`BlogNewsRiverElement found blogcfg ${(new Date() - _start) / 1000} seconds`);

        let _blogcfg = {};
        for (let key in blogcfg) {
            _blogcfg[key] = blogcfg[key];
        }

        let maxEntries = $element.attr('maxentries');
        if (maxEntries) {
            _blogcfg.maxEntries = Number.parseInt(maxEntries);
        }

        let template = $element.attr("template");
        if (!template) template = "blog-news-river.html.ejs";

        let rootPath = $element.attr('root-path');
        if (rootPath) {
            _blogcfg.rootPath = rootPath;
        }

        let docRootPath = $element.attr('doc-root-path');
        if (docRootPath) {
            _blogcfg.rootPath = path.dirname(docRootPath);
        }

        // console.log(`BlogNewsRiverElement duplicate blogcfg ${(new Date() - _start) / 1000} seconds`);

        // console.log(`blog-news-river rootPath ${rootPath} docRootPath ${docRootPath} computed blogcfg`, _blogcfg);

        let documents = await this.array.options.config.plugin(pluginName)
                    .findBlogDocs(this.array.options.config, _blogcfg, blogtag);

        /* console.log(`blog-news-river ${blogtag} `, documents.map(d => {
            return { vpath: d.vpath, date: d.docMetadata.publicationDate };
        })); */
        // let documents = await this.array.options.config.plugin(pluginName)
        //            .NEWfindBlogDocs(this.array.options.config, _blogcfg, blogtag, docRootPath);


        // console.log(`BlogNewsRiverElement findBlogDocs ${documents.length} entries ${(new Date() - _start) / 1000} seconds`);

        if (!documents) {
            throw new Error(`BlogNewsRiverElement NO blog docs found for ${blogtag}`);
        }

        /* for (let item of documents) {
            console.log(`${blogtag} ${metadata.document.path} ${item.vpath} ${item.docMetadata.publicationDate}`);
        } */

        let ret = await akasha.partial(this.array.options.config, template, {
            documents: documents,
            feedUrl: _blogcfg.rssurl
        });

        // console.log(`BlogNewsRiverElement rendered ${(new Date() - _start) / 1000} seconds`);
        return ret;

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

        let _blogcfg = {};
        for (let key in blogcfg) {
            _blogcfg[key] = blogcfg[key];
        }

        let maxEntries = $element.attr('maxentries');
        if (maxEntries) {
            _blogcfg.maxEntries = Number.parseInt(maxEntries);
        }

        var template = $element.attr("template");
        if (!template) template = "blog-news-indexes.html.ejs";

        let indexDocuments = await this.array.options.config.plugin(pluginName)
                .findBlogIndexes(this.array.options.config, _blogcfg);
        return akasha.partial(this.array.options.config, template, {
                    indexDocuments
                });
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
        // const _start = new Date();
        if (! metadata.blogtag) { return; }
        let blogcfg = this.array.options.bloglist[metadata.blogtag];
        if (!blogcfg) throw new Error(`No blog configuration found for blogtag ${metadata.blogtag} in ${metadata.document.path}`);

        let docpathNoSlash = metadata.document.path.startsWith('/')
                        ? metadata.document.path.substring(1)
                        : metadata.document.path;
        let documents = await this.array.options.config
                .plugin(pluginName)
                .findBlogDocs(this.array.options.config, blogcfg, metadata.blogtag);

        // let documents = await this.array.options.config.plugin(pluginName)
        //        .NEWfindBlogDocs(this.array.options.config, blogcfg, metadata.blogtag);

        // console.log(`BlogNextPrevElement findBlogDocs found ${documents.length} items ${(new Date() - _start)/1000} seconds`);
        let docIndex = -1;
        let j = 0;
        for (let j = 0; j < documents.length; j++) {
            let document = documents[j];
            // console.log(`blog-next-prev findBlogDocs blogtag ${util.inspect(metadata.blogtag)} found ${document.basedir} ${document.docpath} ${document.docfullpath} ${document.renderpath}  MATCHES? ${docpathNoSlash}  ${metadata.document.path}`);
            // console.log(`BlogNextPrevElement ${path.normalize(document.vpath)} === ${path.normalize(docpathNoSlash)}`);
            // console.log(`BlogNextPrevElement ${path.normalize(document.vpath)}`);
            if (path.normalize(document.vpath) === path.normalize(docpathNoSlash)) {
                docIndex = j;
            }
        }
        // console.log(`BlogNextPrevElement docIndex ${docIndex}`);
        if (docIndex >= 0) {
            let prevDoc = docIndex === 0
                ? documents[documents.length - 1]
                : documents[docIndex - 1];
            let thisDoc = documents[docIndex];
            let nextDoc = docIndex === documents.length - 1
                ? documents[0]
                : documents[docIndex + 1];
            // console.log(`prevDoc ${docIndex} ${prevDoc.renderPath} ${prevDoc.docMetadata.title}`);
            // console.log(`thisDoc ${docIndex} ${thisDoc.renderPath} ${thisDoc.docMetadata.title}`);
            // console.log(`nextDoc ${docIndex} ${nextDoc.renderPath} ${nextDoc.docMetadata.title}`);
            let html = await akasha.partial(this.array.options.config, 'blog-next-prev.html.ejs', {
                prevDoc, nextDoc
            });
            // console.log(`BlogNextPrevElement findBlogDocs FINISH ${(new Date() - _start)/1000} seconds`);
            return html;
        } else {
            console.error(`blog-next-prev did not find document ${docpathNoSlash} ${metadata.document.path} in blog`);
            throw new Error(`did not find document ${docpathNoSlash} ${metadata.document.path} in blog ${metadata.blogtag}`);
        }
    }
}
