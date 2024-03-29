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


    blogSelector(tag) {

        if (!this.isBlogtag(tag)) {
            throw new Error(`blogSelector given invalid blogtag ${tag}`);
        }

        const blogcfg = this.blogcfg(tag);
        return this.blogSelectorForCFG(blogcfg, tag);
    }

    /*
     * For future - for ForerunnerDB View */
    blogSelectorForCFG(blogcfg, tag) {

        const selector = {
            docMetadata: {
                blogtag: { $eeq: tag }
            }
        };
        if (blogcfg.blogtags && Array.isArray(blogcfg.blogtags)) {
            selector.docMetadata.blogtag = { $in: blogcfg.blogtags };
        }
        const limitor = {};
        if (blogcfg.matchers
         && typeof blogcfg.matchers.rendersToHTML !== 'undefined') {
            selector.rendersToHTML = { $eeq: blogcfg.matchers.rendersToHTML };
        }
        if (blogcfg.matchers && blogcfg.matchers.path) {
            if (blogcfg.matchers.path instanceof RegExp) {
                selector.vpath = blogcfg.matchers.path;
            } else if (typeof blogcfg.matchers.path === 'string') {
                selector.vpath = new RegExp(blogcfg.matchers.path);
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.path ${util.inspect(blogcfg.matchers.path)}`);
            }
        }
        if (blogcfg.matchers && blogcfg.matchers.renderpath) {
            if (blogcfg.matchers.renderpath instanceof RegExp) {
                selector.renderPath = blogcfg.matchers.renderpath;
            } else if (typeof blogcfg.matchers.path === 'string') {
                selector.renderPath = new RegExp(blogcfg.matchers.renderpath);
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.renderpath ${util.inspect(blogcfg.matchers.renderpath)}`);
            }
        }
        if (blogcfg.matchers && blogcfg.matchers.layouts) {
            if (typeof blogcfg.matchers.layouts === 'string'
             || Array.isArray(blogcfg.matchers.layouts)) {
                if (!selector.docMetadata) selector.docMetadata = {};
                selector.docMetadata.layout = { $in: blogcfg.matchers.layouts };
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.layouts ${util.inspect(blogcfg.matchers.layouts)}`);
            }
        }
        if (typeof blogcfg.rootPath === 'string') {
            // There might have been a 'matchers.renderpath' in which case
            // we want to convert it into a $and clause to match both.
            // console.log(`blogSelector blogcfg.rootPath ${blogcfg.rootPath}`);
            if (blogcfg.rootPath !== '') {
                let rootPathMatch = new RegExp(`^${blogcfg.rootPath}`);
                if (selector.renderPath) {
                    let renderPathMatch = selector.renderPath;
                    delete selector.renderPath;
                    selector['$and'] = [
                        { renderPath: renderPathMatch },
                        { renderPath: rootPathMatch }
                    ];
                } else {
                    selector.renderPath = rootPathMatch;
                }
            }
        } else if (blogcfg.rootPath) {
            throw new Error(`Incorrect setting for blogcfg.rootPath ${util.inspect(blogcfg.rootPath)}`);
        }

        // viewInfo.selector = selector;
        // return viewInfo.selector;

        return selector;
    }
    /* */

    /*
     * For future - for ForerunnerDB View
    // This method is untested.  The idea is for setting up a View that will
    // optimize looking for items associated with a blog.
    async blogView(tag) {

        if (!this.isBlogtag(tag)) {
            throw new Error(`blogSelector given invalid blogtag ${tag}`);
        }

        const blogcfg = this.blogcfg(tag);
        const viewInfo = this.viewInfo(tag);
        const selector = this.blogSelector(tag);

        if (viewInfo.theview) return viewInfo.theview;

        const cache = await akasha.cache;
        const filecache = await akasha.filecache;
        const coll = filecache.documents.getCollection(filecache.documents.collection);

        viewInfo.theview = cache.view(`blogdocs-${tag}`);
        viewInfo.theview.from(coll);
        viewInfo.theview.query(selector);

        return viewInfo.theview;
    }
    */

    // TODO:-
    //    0) initialize this view early after caches are setup
    //    1) in filecache code.. add function, 'view', with the above
    //    2) replace existing thing on cacheIndexes with a general hook
    //       for plugins to customize with
    //
    //    a) rewrite blogDocs to use this view
    //    b) test performance difference between existing blogDocs and new one
    //    c) Do same for blogIndexes
    //    d) make sure the custom elements are rewritten to use the view
    //    e) maybe add custom functions to support those custom elements, which can also
    //       be called from NJK macros


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

        // Performance testing
        // const _start = new Date();

        if (!blogcfg || !blogcfg.matchers) {
            throw new Error(`findBlogDocs no blogcfg`);
        }

        const selector = this.blogSelectorForCFG(blogcfg, blogtag);

        // console.log(`findBlogDocs ${blogtag}`, selector);

        /*

        const selector = {
            docMetadata: {
                blogtag: { $eeq: blogtag }
            }
        };
        if (blogcfg.blogtags && Array.isArray(blogcfg.blogtags)) {
            selector.docMetadata.blogtag = { $in: blogcfg.blogtags };
        }
        const limitor = {};
        if (blogcfg.matchers
         && typeof blogcfg.matchers.rendersToHTML !== 'undefined') {
            selector.rendersToHTML = { $eeq: blogcfg.matchers.rendersToHTML };
        }
        if (blogcfg.matchers && blogcfg.matchers.path) {
            if (blogcfg.matchers.path instanceof RegExp) {
                selector.vpath = blogcfg.matchers.path;
            } else if (typeof blogcfg.matchers.path === 'string') {
                selector.vpath = new RegExp(blogcfg.matchers.path);
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.path ${util.inspect(blogcfg.matchers.path)}`);
            }
        }
        if (blogcfg.matchers && blogcfg.matchers.renderpath) {
            if (blogcfg.matchers.renderpath instanceof RegExp) {
                selector.renderPath = blogcfg.matchers.renderpath;
            } else if (typeof blogcfg.matchers.path === 'string') {
                selector.renderPath = new RegExp(blogcfg.matchers.renderpath);
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.renderpath ${util.inspect(blogcfg.matchers.renderpath)}`);
            }
        }
        if (blogcfg.matchers && blogcfg.matchers.layouts) {
            if (typeof blogcfg.matchers.layouts === 'string'
             || Array.isArray(blogcfg.matchers.layouts)) {
                if (!selector.docMetadata) selector.docMetadata = {};
                selector.docMetadata.layout = { $in: blogcfg.matchers.layouts };
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.layouts ${util.inspect(blogcfg.matchers.layouts)}`);
            }
        }
        if (typeof blogcfg.rootPath === 'string') {
            // There might have been a 'matchers.renderpath' in which case
            // we want to convert it into a $and clause to match both.
            if (blogcfg.rootPath !== '') {
                let rootPathMatch = new RegExp(`^${blogcfg.rootPath}`);
                if (selector.renderPath) {
                    let renderPathMatch = selector.renderPath;
                    delete selector.renderPath;
                    selector['$and'] = [
                        { renderPath: renderPathMatch },
                        { renderPath: rootPathMatch }
                    ];
                } else {
                    selector.renderPath = rootPathMatch;
                }
            }
        } else if (blogcfg.rootPath) {
            throw new Error(`Incorrect setting for blogcfg.rootPath ${util.inspect(blogcfg.rootPath)}`);
        }
        */

        /*
         * With ForerunnerDB it is possible for the database
         * query to both sort the results (using $orderBy) and
         * to limit the result set size (using $limit).
         *
         * But this was found to not work in this case.  The number
         * of entries was correctly limited, but they were not
         * correctly sorted.  That is, I tried this limitor clause
         *
         *   {
         *     $page: 0,
         *     $limit: maxEntries,
         *     $orderBy: { docMetadata: { publicationDate: 1 }}
         *   }
         *
         * But the resulting list was from somewhere in the middle
         * of the set of documents, rather than the first N
         * entries.
         *
         * Even this limitor:
         *
         *   {
         *     $orderBy: { docMetadata: { publicationDate: 1 }}
         *   }
         *
         * That gave us a similar random set of items from the
         * middle of the blog, rather than the first few.
         *
         * It's chosen instead to not use ForerunnerDB for
         * either purpose, and to handle sorting and limiting
         * outside of the Forerunner query.
         *
         * The result is that <code>coll.find</code> below always
         * returns the full set of entries in the blog.  The
         * <code>sort</code> and <code>reverse</code> phases will
         * both receive the full set of entries.  That way we
         * reliably know the <code>maxEntries</code> is working
         * with a full set.
         */


        // Performance testing
        // console.log(`findBlogDocs ${blogtag} options setup ${(new Date() - _start) / 1000} seconds`);

        const filecache = await akasha.filecache;

        // console.log(`findBlogDocs ${blogtag} selector ${util.inspect(selector)}`);

        // Search by directly calling ForerunnerDB API
        const coll = filecache.documents.getCollection(filecache.documents.collection);
        const _documents = coll.find(selector);

        // Performance testing
        // console.log(`findBlogDocs ${blogtag} after searching ${_documents.length} documents ${(new Date() - _start) / 1000} seconds`);

        // Fill in the data expected by blog-podcast templates
        let documents = [];
        for (let doc of _documents) {
            // console.log(`findBlogDocs ${blogtag}`, doc.vpath);
            documents.push(await filecache.documents.readDocument(doc));
        }
        for (let doc of documents) {
            if (!doc.metadata) console.log(`findBlogDocs DID NOT FIND METADATA IN ${doc.vpath}`, doc);
            if (!doc.stat) {
                doc.stat = await fs.stat(doc.fspath);
            }
        }

        // Performance testing
        // console.log(`findBlogDocs ${blogtag} after newInitMetadata ${documents.length} documents ${(new Date() - _start) / 1000} seconds`);

        let dateErrors = [];
        documents.sort((a, b) => {
            let publA = a.docMetadata && a.docMetadata.publicationDate 
                    ? a.docMetadata.publicationDate : a.stat.mtime;
            let aPublicationDate = Date.parse(publA);
            if (isNaN(aPublicationDate)) {
                dateErrors.push(`findBlogDocs ${a.renderPath} BAD DATE publA ${publA}`);
            }
            let publB = b.docMetadata && b.docMetadata.publicationDate 
                    ? b.docMetadata.publicationDate : b.stat.mtime;
            let bPublicationDate = Date.parse(publB);
            // console.log(`findBlogDocs publA ${publA} aPublicationDate ${aPublicationDate} publB ${publB} bPublicationDate ${bPublicationDate}`);
            if (isNaN(bPublicationDate)) {
                dateErrors.push(`findBlogDocs ${b.renderPath} BAD DATE publB ${publB}`);
            }
            if (aPublicationDate < bPublicationDate) return -1;
            else if (aPublicationDate === bPublicationDate) return 0;
            else return 1;
        });
        if (dateErrors.length >= 1) {
            throw dateErrors;
        }
        // Performance testing
        // console.log(`findBlogDocs ${blogtag} after sorting ${documents.length} documents ${(new Date() - _start) / 1000} seconds`);

        documents.reverse();
        // Performance testing
        // console.log(`findBlogDocs ${blogtag} after reversing ${documents.length} documents ${(new Date() - _start) / 1000} seconds`);

        // Limit the number of entries
        if (typeof blogcfg.maxEntries !== 'undefined') {
            let maxEntries;
            try {
                maxEntries = Number.parseInt(blogcfg.maxEntries);
            } catch (err) {
                maxEntries = undefined;
            }
            let count = 0;
            documents = documents.filter(doc => {
                let ret = true;
                if (count > maxEntries) return false;
                count++;
                return ret;
            });
            // Performance testing
            // console.log(`findBlogDocs ${blogtag} after limiting entries ${documents.length} documents ${(new Date() - _start) / 1000} seconds`);
        }

        return documents;
    }

    async findBlogIndexes(config, blogcfg) {
        if (!blogcfg.indexmatchers) return [];

        return await akasha.documentSearch(config, {
            pathmatch: blogcfg.indexmatchers.path ? blogcfg.indexmatchers.path : undefined,
            // renderers: [ akasha.HTMLRenderer ],
            glob: '**/*.html',
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
            _blogcfg.maxEntries = maxEntries;
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

        var template = $element.attr("template");
        if (!template) template = "blog-news-indexes.html.ejs";

        let indexDocuments = await this.array.options.config.plugin(pluginName)
                .findBlogIndexes(this.array.options.config, blogcfg);
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
