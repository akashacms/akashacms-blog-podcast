/**
 * Copyright 2015-2025 David Herron
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

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import url from 'node:url';
import akasha, {
    Configuration,
    CustomElement,
    Munger,
    PageProcessor
} from 'akasharender';
const mahabhuta = akasha.mahabhuta;

const pluginName = "@akashacms/plugins-blog-podcast";

const __dirname = import.meta.dirname;

export class BlogPodcastPlugin extends akasha.Plugin {

    #config;

    constructor() {
        super(pluginName);

    }

    configure(config, options) {
        this.#config = config;
        // this.config = config;
        this.akasha = config.akasha;
        this.options = options ? options : {};
        this.options.config = config;
		config.addPartialsDir(path.join(__dirname, 'partials'));
        config.addMahabhuta(mahabhutaArray(options, config, this.akasha, this));
        if (!options.bloglist) options.bloglist = [];
	}

    get config() { return this.#config; }

    blogcfg(tag) { return this.options.bloglist[tag]; }

    isBlogtag(tag) {
        let type = typeof this.options.bloglist[tag];
        return type !== 'undefined' && type === 'object';
    }

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
                            : doc.mtimeMs
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

        selector.rendersToHTML = true;
        selector.blogtag = blogtag;

        // Support matching more than one blogtag
        if (blogcfg.matchers && blogcfg.matchers.blogtags
         && Array.isArray(blogcfg.matchers.blogtags)
         && blogcfg.matchers.blogtags.length >= 1
        ) {
            selector.blogtags = blogcfg.matchers.blogtags;
        }

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
        // The point of `rootPath` versus `renderpath` is
        // the difference between an SQL LIKE versus using
        // regular expressions.  RootPath with the SQLITE3 cache
        // is matched using `renderPath LIKE 'rootPath%'` wheres
        // the others are matched with regular expressions.

        if (blogcfg.rootPath) {
            selector.rootPath = blogcfg.rootPath;
        }
        // Also support rootPath in the matchers
        if (blogcfg.matchers.rootPath) {
            selector.rootPath = blogcfg.matchers.rootPath;
        }

        if (blogcfg.matchers && blogcfg.matchers.layouts) {
            if (Array.isArray(blogcfg.matchers.layouts)) {
                selector.layouts = blogcfg.matchers.layouts;
            } else if (typeof blogcfg.matchers.layouts === 'string') {
                selector.layouts = [ blogcfg.matchers.layouts ];
            } else {
                throw new Error(`Incorrect setting for blogcfg.matchers.layouts ${util.inspect(blogcfg.matchers.layouts)}`);
            }
        }

        // This is solely about filtering for blogtag.
        // This functionality is now handled as
        // a search option.
        
        // selector.filterfunc = (config, options, doc) => {
        //     if (doc.docMetadata
        //      && doc.docMetadata.blogtag) {
        //         // This could possibly be in a blog, but not in this blog
        //         // console.log(`blog podcast filterfunc ${doc.vpath} ${util.inspect(options.blogtag)} ${util.inspect(doc?.docMetadata?.blogtag)}`);
        //         if (Array.isArray(options.blogtags)
        //          && !options.blogtags.includes(doc.docMetadata.blogtag)) {
        //             // console.log(`findBlogDocs filterfunc ${doc.metaData.blogtag} not in ${util.inspect(options.blogtags)} ${doc.vpath}`);
        //             return false;
        //         } else if (typeof options.blogtags === 'string'
        //          && doc.docMetadata.blogtag !== options.blogtags) {
        //             // console.log(`findBlogDocs filterfunc ${doc.metaData.blogtag} not in ${options.blogtags} ${doc.vpath}`);
        //             return false;
        //         }
        //     } else if (!doc.docMetadata || !doc.docMetadata.blogtag) {
        //         // This cannot be in any blog
        //         // console.log(`findBlogDocs filterfunc NOT IN ANY BLOG ${doc.vpath}`)
        //         return false;
        //     }
        //     return true;
        // };

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
        selector.reverse = true;

        if (typeof blogcfg.maxEntries === 'number'
         && blogcfg.maxEntries > 0) {
            selector.limit = blogcfg.maxEntries;
        }

        if (typeof blogcfg.startAt === 'number'
         && blogcfg.startAt >= 0) {
            selector.offset = blogcfg.startAt;
        }

        // console.log(`findBlogDocs`, selector);

        // console.log(filecache);
        // console.log(await config.documentsCache());
        
        let documents = await akasha.filecache.documentsCache.search(selector);
        
        if (dateErrors.length >= 1) {
            throw dateErrors;
        } 

        // Performance testing
        // console.log(`findBlogDocs ${blogtag} options setup ${(new Date() - _start) / 1000} seconds`);


        // Performance testing
        // console.log(`findBlogDocs ${blogtag} after searching ${_documents.length} documents ${(new Date() - _start) / 1000} seconds`);

        return documents;
    }

    /**
     * This seems to be tasked with finding the
     * index pages (index.html.EXT) in a blog. But,
     * for what purpose?  And is this being used?
     * There is no Mahafunc referring to this.
     *
     * Actually - BlogNewsIndexElement - blog-news-index,
     * which corresponds to blog-news-indexes.html.njk
     * and blog-news-indexes.html.ejs.
     *
     * @param {*} config 
     * @param {*} blogcfg 
     * @returns 
     */
    async findBlogIndexes(config, blogcfg) {
        if (!blogcfg.indexmatchers) return [];

        const documents = this.akasha.filecache.documentsCache;
        return documents.search({
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

export function mahabhutaArray(
    options,
    config, // ?: Configuration,
    akasha, // ?: any,
    plugin  // ?: Plugin
) {
    let ret = new mahabhuta.MahafuncArray(pluginName, options);
    ret.addMahafunc(new BlogNewsRiverElement(config, akasha, plugin));
    ret.addMahafunc(new BlogRSSIconElement(config, akasha, plugin));
    ret.addMahafunc(new BlogRSSLinkElement(config, akasha, plugin));
    ret.addMahafunc(new BlogRSSListElement(config, akasha, plugin));
    ret.addMahafunc(new BlogNextPrevElement(config, akasha, plugin));
    ret.addMahafunc(new BlogNewsIndexElement(config, akasha, plugin));
    return ret;
};


class BlogNewsRiverElement extends CustomElement {
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

        let blogcfg = this.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        // console.log(`BlogNewsRiverElement found blogcfg ${(new Date() - _start) / 1000} seconds`);

        let _blogcfg = structuredClone(blogcfg);

        let maxEntries = $element.attr('maxentries');
        if (maxEntries) {
            _blogcfg.maxEntries = Number.parseInt(maxEntries);
        }

        let template = $element.attr("template");
        if (!template) template = "blog-news-river.html.njk";

        let rootPath = $element.attr('root-path');
        if (rootPath) {
            _blogcfg.matchers.rootPath = rootPath;
        }

        let docRootPath = $element.attr('doc-root-path');
        if (docRootPath) {
            _blogcfg.matchers.rootPath = path.dirname(docRootPath);
        }

        // console.log(`BlogNewsRiverElement duplicate blogcfg ${(new Date() - _start) / 1000} seconds`);

        // console.log(`blog-news-river rootPath ${rootPath} docRootPath ${docRootPath} computed blogcfg`, _blogcfg);

        let documents = await this.config.plugin(pluginName)
                    .findBlogDocs(this.config, _blogcfg, blogtag);

        // console.log(`blog-news-river ${blogtag} ${util.inspect(_blogcfg)} `, documents.map(d => {
        //     return {
        //         vpath: d.vpath,
        //         renderPath: d.renderPath,
        //         date: d.docMetadata.publicationDate
        //     };
        // }));

        // let documents = await this.array.options.config.plugin(pluginName)
        //            .NEWfindBlogDocs(this.array.options.config, _blogcfg, blogtag, docRootPath);


        // console.log(`BlogNewsRiverElement findBlogDocs ${documents.length} entries ${(new Date() - _start) / 1000} seconds`);

        if (!documents) {
            throw new Error(`BlogNewsRiverElement NO blog docs found for ${blogtag}`);
        }

        // for (let item of documents) {
        //     console.log(`NEWS RIVER ITEM ${blogtag} ${metadata.document.path} ${item.vpath} ${item.renderPath} ${item.docMetadata.publicationDate}`);
        // }

        let ret = await this.akasha.partial(this.config, template, {
            documents: documents,
            feedUrl: _blogcfg.rssurl
        });

        // console.log(`NEWS RIVER RENDERED TO `, ret);

        // console.log(`BlogNewsRiverElement rendered ${(new Date() - _start) / 1000} seconds`);
        return ret;

    }
}

class BlogNewsIndexElement extends CustomElement {
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

        var blogcfg = this.options.bloglist[blogtag];
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

        let indexDocuments = await this.config.plugin(pluginName)
                .findBlogIndexes(this.config, _blogcfg);
        return akasha.partial(this.config, template, {
                    indexDocuments
                });
    }
}

class BlogRSSIconElement extends CustomElement {
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

        var blogcfg = this.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        var template = $element.attr("template");
        if (!template) template = "blog-rss-icon.html.ejs";

        return this.akasha.partial(this.config, template, {
            feedUrl: blogcfg.rssurl,
            title: title
        });
    }
}

class BlogRSSLinkElement extends CustomElement {
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

        var blogcfg = this.options.bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        var template = $element.attr("template");
        if (!template) template = "blog-rss-link.html.ejs";

        return this.akasha.partial(this.config, template, {
            feedUrl: blogcfg.rssurl
        });
    }
}

class BlogRSSListElement extends CustomElement {
    get elementName() { return "blog-feeds-all"; }
    process($element, metadata, dirty) {
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "blog-feeds-all.html.ejs";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
        dirty();
        return this.akasha.partial(this.config, template, {
            id, additionalClasses,
            bloglist: this.options.bloglist
        });
    }
}

class BlogNextPrevElement extends CustomElement {
    get elementName() { return "blog-next-prev"; }
    async process($element, metadata, dirty) {
        // const _start = new Date();
        if (! metadata.blogtag) { return; }
        let blogcfg = this.options.bloglist[metadata.blogtag];
        if (!blogcfg) throw new Error(`No blog configuration found for blogtag ${metadata.blogtag} in ${metadata.document.path}`);

        let docpathNoSlash = metadata.document.path.startsWith('/')
                        ? metadata.document.path.substring(1)
                        : metadata.document.path;
        let documents = await this.config
                .plugin(pluginName)
                .findBlogDocs(this.config, blogcfg, metadata.blogtag);

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
            let html = await this.akasha.partial(this.options.config, 'blog-next-prev.html.ejs', {
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
