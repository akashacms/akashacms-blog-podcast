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
const async    = require('async');
const akasha   = require('akasharender');
const mahabhuta = akasha.mahabhuta;
const co       = require('co');

const log   = require('debug')('akasha:blog-podcast-plugin');
const error = require('debug')('akasha:error-blog-podcast-plugin');

const pluginName = "akashacms-blog-podcast";

module.exports = class BlogPodcastPlugin extends akasha.Plugin {
    constructor() { super(pluginName); }

	configure(config) {
        this._config = config;
		config.addPartialsDir(path.join(__dirname, 'partials'));
		config.addMahabhuta(module.exports.mahabhuta);
        config.pluginData(pluginName).bloglist = [];
	}

    addBlogPodcast(config, name, blogPodcast) {
        config.pluginData(pluginName).bloglist[name] = blogPodcast;
        return config;
    }

    isLegitLocalHref(config, href) {
        // console.log(`isLegitLocalHref ${util.inspect(config.pluginData(pluginName).bloglist)} === ${href}?`);
        for (var blogkey in config.pluginData(pluginName).bloglist) {
            var blogcfg = config.pluginData(pluginName).bloglist[blogkey];
            // console.log(`isLegitLocalHref ${blogcfg.rssurl} === ${href}?`);
            if (blogcfg.rssurl === href) {
                return true;
            }
        }
        return false;
    }

    onSiteRendered(config) {
        /* console.log(`blog-podcast onSiteRendered ${util.inspect(config.pluginData(pluginName).bloglist)}`);
        console.log(`   Object.keys ${util.inspect(Object.keys(config.pluginData(pluginName).bloglist))}`);
        for (let key in config.pluginData(pluginName).bloglist) {
            console.log(`blog-podcast in ${key} hasOwnProperty ${config.pluginData(pluginName).bloglist.hasOwnProperty(key)}`);
            if (config.pluginData(pluginName).bloglist.hasOwnProperty(key)) {
                console.log(`   OBJECT ${config.pluginData(pluginName).bloglist[key]}`);
            }
        } */
        return co(function* () {
            for (var blogkey in config.pluginData(pluginName).bloglist) {
                if (!config.pluginData(pluginName).bloglist.hasOwnProperty(blogkey)) {
                    continue;
                }
                var blogcfg = config.pluginData(pluginName).bloglist[blogkey];
                // console.log(`blog-podcast blogcfg ${util.inspect(blogcfg)}`);
                var documents = yield findBlogDocs(config, undefined, blogcfg);
                var count = 0;
                var documents2 = documents.filter(doc => {
                    if (typeof maxEntries === "undefined"
                    || (typeof maxEntries !== "undefined" && count++ < maxEntries)) {
                        return true;
                    } else return false;
                });
                // log('blog-news-river documents2 '+ util.inspect(documents2));

                var rssitems = documents2.map(doc => {
                    return {
                        title: doc.metadata.title,
                        description: doc.metadata.teaser ? doc.metadata.teaser : "",
                        url: config.root_url +'/'+ doc.renderpath,
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

                yield akasha.generateRSS(config, blogcfg, {
                        feed_url: config.renderDestination + blogcfg.rssurl,
                        pubDate: new Date()
                    },
                    rssitems, blogcfg.rssurl);
            }
        });
    }
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
var findBlogDocs = co.wrap(function* (config, metadata, blogcfg) {

    if (!blogcfg || !blogcfg.matchers) {
        throw new Error(`findBlogDocs no blogcfg for ${util.inspect(metadata.document)}`);
    }

    var documents = yield akasha.documentSearch(config, {
        // rootPath: docDirPath,
        pathmatch: blogcfg.matchers.path ? blogcfg.matchers.path : undefined,
        renderers: [ akasha.HTMLRenderer ],
        layouts: blogcfg.matchers.layouts ? blogcfg.matchers.layouts : undefined,
        rootPath: blogcfg.rootPath ? blogcfg.rootPath : undefined
    });

    // console.log('findBlogDocs '+ util.inspect(documents));
    documents.sort((a, b) => {
        var aPublicationDate = Date.parse(
            a.metadata.publicationDate ? a.metadata.publicationDate : a.stat.mtime
        );
        var bPublicationDate = Date.parse(
            b.metadata.publicationDate ? b.metadata.publicationDate : b.stat.mtime
        );
        if (aPublicationDate < bPublicationDate) return -1;
        else if (aPublicationDate === bPublicationDate) return 0;
        else return 1;
    });
    documents.reverse();
    return documents;
});

function findBlogIndexes(config, metadata, blogcfg) {
    if (!blogcfg.indexmatchers) return Promise.resolve([]);

    return akasha.documentSearch(config, {
        pathmatch: blogcfg.indexmatchers.path ? blogcfg.indexmatchers.path : undefined,
        renderers: [ akasha.HTMLRenderer ],
        layouts: blogcfg.indexmatchers.layouts ? blogcfg.indexmatchers.layouts : undefined,
        rootPath: blogcfg.rootPath ? blogcfg.rootPath : undefined
    });
}

module.exports.mahabhuta = new mahabhuta.MahafuncArray("akashacms-blog-podcast", {});

class BlogNewsRiverElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-news-river"; }
    process($element, metadata, dirty) {
        var blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            error("NO BLOG TAG in blog-news-river"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-news-river"+ metadata.document.path);
        }

        // log('blog-news-river '+ blogtag +' '+ metadata.document.path);

        var blogcfg = metadata.config.pluginData(pluginName).bloglist[blogtag];
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

        return findBlogDocs(metadata.config, metadata, _blogcfg)
        .then(documents => {

            // log('blog-news-river documents '+ util.inspect(documents));

            var count = 0;
            var documents2 = documents.filter(doc => {
                if (typeof maxEntries === "undefined"
                || (typeof maxEntries !== "undefined" && count++ < maxEntries)) {
                    return true;
                } else return false;
            });
            // log('blog-news-river documents2 '+ util.inspect(documents2));

            return akasha.partial(metadata.config, template, {
                documents: documents2,
                feedUrl: _blogcfg.rssurl
            });
        });
    }
}
module.exports.mahabhuta.addMahafunc(new BlogNewsRiverElement());

class BlogNewsIndexElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-news-index"; }
    process($element, metadata, dirty) {
        var blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            error("NO BLOG TAG in blog-news-index"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-news-index"+ metadata.document.path);
        }

        var blogcfg = metadata.config.pluginData(pluginName).bloglist[blogtag];
        if (!blogcfg) return done(new Error('No blog configuration found for blogtag '+ blogtag));

        var template = $element.attr("template");
        if (!template) template = "blog-news-indexes.html.ejs";

        return findBlogIndexes(metadata.config, metadata, blogcfg)
        .then(indexDocuments => {
            return akasha.partial(metadata.config, template, { indexDocuments });
        });
    }
}
module.exports.mahabhuta.addMahafunc(new BlogNewsIndexElement());

class BlogRSSIconElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-rss-icon"; }
    process($element, metadata, dirty) {
        var blogtag = $element.attr("blogtag");
        if (!blogtag) {
            blogtag = metadata.blogtag;
        }
        if (!blogtag) {// no blog tag, skip? error?
            error("NO BLOG TAG in blog-rss-icon"+ metadata.document.path);
            throw new Error("NO BLOG TAG in blog-rss-icon"+ metadata.document.path);
        }

        var blogcfg = metadata.config.pluginData(pluginName).bloglist[blogtag];
        if (!blogcfg) throw new Error('No blog configuration found for blogtag '+ blogtag);

        var template = $element.attr("template");
        if (!template) template = "blog-rss-icon.html.ejs";

        return akasha.partial(metadata.config, template, {
            feedUrl: blogcfg.rssurl
        });
    }
}
module.exports.mahabhuta.addMahafunc(new BlogRSSIconElement());

class BlogNextPrevElement extends mahabhuta.CustomElement {
    get elementName() { return "blog-next-prev"; }
    process($element, metadata, dirty) {
        return co(function* () {
            if (! metadata.blogtag) { return; }
            let blogcfg = metadata.config.pluginData(pluginName).bloglist[metadata.blogtag];
            if (!blogcfg) throw new Error(`No blog configuration found for blogtag ${metadata.blogtag} in ${metadata.document.path}`);
    
            let docpathNoSlash = metadata.document.path.startsWith('/') ? metadata.document.path.substring(1) : metadata.document.path;
            let documents = yield findBlogDocs(metadata.config, metadata, blogcfg);

            let docIndex = -1;
            for (var j = 0; docIndex === -1 && j < documents.length; j++) {
                let document = documents[j];
                // console.log(`blog-next-prev findBlogDocs blogtag ${util.inspect(metadata.blogtag)} found ${document.basedir} ${document.docpath} ${document.docfullpath} ${document.renderpath}  MATCHES? ${docpathNoSlash}  ${metadata.document.path}`);
                if (document.docpath === docpathNoSlash /* metadata.document.path */) {
                    docIndex = j;
                }
            }
            if (docIndex >= 0) {
                let prevDoc = docIndex === 0 ? documents[documents.length - 1] : documents[docIndex - 1];
                let nextDoc = docIndex === documents.length - 1 ? documents[0] : documents[docIndex + 1];
                let html = yield akasha.partial(metadata.config, 'blog-next-prev.html.ejs', {
                    prevDoc, nextDoc
                });
                return html;
            } else {
                // console.error(`blog-next-prev did not find document ${docpathNoSlash} ${metadata.document.path} in blog`);
                throw new Error(`did not find document ${docpathNoSlash} ${metadata.document.path} in blog`);
            }
        });
    }
}
module.exports.mahabhuta.addMahafunc(new BlogNextPrevElement());
