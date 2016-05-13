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
const akasha   = require('../akasharender');

const log   = require('debug')('akasha:blog-podcast-plugin');
const error = require('debug')('akasha:error-blog-podcast-plugin');

module.exports = class BlogPodcastPlugin extends akasha.Plugin {
	constructor() {
		super("akashacms-blog-podcast");
	}
	
	configure(config) {
        this._config = config;
		config.addPartialsDir(path.join(__dirname, 'partials'));
		config.addMahabhuta(module.exports.mahabhuta);
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
var findBlogDocs = function(config, metadata, blogcfg) {
    
    return akasha.documentSearch(config, {
        // rootPath: docDirPath,
        pathmatch: blogcfg.matchers.path ? blogcfg.matchers.path : undefined,
        renderers: [ HTMLRenderer ],
        layouts: blogcfg.matchers.layouts ? blogcfg.matchers.layouts : undefined,
        rootPath: blogcfg.rootPath ? blogcfg.rootPath : undefined
    })
    .then(documents => {
        documents.sort(function(a, b) {
            var aPublicationDate = Date.parse(
                    a.metadata.publicationDate
                  ? a.metadata.publicationDate
                  : a.stat.mtime
            );
            var bPublicationDate = Date.parse(
                    b.metadata.publicationDate
                  ? b.metadata.publicationDate
                  : b.stat.mtime
            );
            if (aPublicationDate < bPublicationDate) return -1;
            else if (aPublicationDate === bPublicationDate) return 0;
            else return 1;
        });
        documents.reverse();
        return documents;
    });
};

module.exports.mahabhuta = [
	function($, metadata, dirty, done) {
        if (! metadata.blogtag) return done();
        if (!metadata.config.blogPodcast) return done();
		var blogcfg = metadata.config.blogPodcast[metadata.blogtag];
        if (!blogcfg) return done(new Error('No blog configuration found for blogtag '+ metadata.blogtag));
        if (! metadata.config.blogPodcast.hasOwnProperty(metadata.blogtag)) {
            return done(new Error("no blogPodcast item for "+ metadata.blogtag));
        }
		var elements = [];
		$('blog-news-river').each(function(i, elem) { elements.push(elem); });
		if (elements.length > 0) {
			findBlogDocs(metadata.config, metadata, blogcfg)
            .then(documents => {
                async.eachSeries(elements, function(element, next) {
                    var maxEntries = $(element).attr('maxentries');
                    
                    // console.log(element.name +' '+ metadata.blogtag);
                    
                    var count = 0;
                    var documents2 = documents.filter(doc => {
                        if (typeof maxEntries === "undefined"
                        || (typeof maxEntries !== "undefined" && count++ < maxEntries)) {
                            return true;
                        } else return false;
                    });
                    var rssitems   = documents2.map(doc => {
                        return {
                            title: doc.metadata.title,
                            description: doc.metadata.teaser ? doc.metadata.teaser : "",
                            url: metadata.config.root_url +'/'+ doc.path,
                            date: doc.metadata.publicationDate
                                ? doc.metadata.publicationDate
                                : doc.stat.mtime
                        };
                    });
                    
                    var feedRenderTo = blogcfg.rssurl;
                    akasha.generateRSS(blogcfg.rss, {
                            feed_url: metadata.config.root_url + feedRenderTo,
                            pubDate: new Date()
                        },
                        rssitems, feedRenderTo,	function(err) {
                            if (err) logger.error(err);
                        });
                    
                    akasha.partial(metadata.config, "blog-news-river.html.ejs", {
                        documents: documents2,
                        feedUrl: feedRenderTo
                    },
                    function(err, htmlRiver) {
                        if (err) next(err);
                        else {
                            $(element).replaceWith(htmlRiver);
                            next();
                        }
                    });
                },
                function(err) {
                    if (err) done(err);
                    else done();
                });
            });
		}
    },
	
	function($, metadata, dirty, done) {
        if (! metadata.blogtag) return done();
        if (!metadata.config.blogPodcast) return done();
		var blogcfg = metadata.config.blogPodcast[metadata.blogtag];
        if (!blogcfg) return done(new Error('No blog configuration found for blogtag '+ metadata.blogtag));
        if (! metadata.config.blogPodcast.hasOwnProperty(metadata.blogtag)) {
            return done(new Error("no blogPodcast item for "+ metadata.blogtag));
        }
		var elements = [];
		var documents;
        $('blog-next-prev').each(function(i, elem) { elements.push(elem); });
        if (elements.length > 0) {
            findBlogDocs(metadata.config, metadata, blogcfg)
            .then(documents => {
                async.eachSeries(elements, 
                (element, next) => {
                    var docIndex = -1;
                    for (var j = 0; docIndex === -1 && j < documents.length; j++) {
                        if (documents[j].path === docEntry.path) {
                            docIndex = j;
                        }
                    }
                    if (docIndex >= 0) {
                        var prevDoc = docIndex === 0 ? documents[documents.length - 1] : documents[docIndex - 1];
                        var nextDoc = docIndex === documents.length - 1 ? documents[0] : documents[docIndex + 1];
                        akasha.partial(metadata.config, 'blog-next-prev.html.ejs', {
                            prevDoc, nextDoc, thisDoc: docEntry, documents
                        }, 
                        (err, html) => {
                            if (err) { return next(err); }
                            $(element).replaceWith(html);
                            next();
                        });
                    } else {
                        next(new Error('did not find document in blog'));
                    }
                },
                err => {
                    if (err) done(err);
                    else done();
                });
            })
            .catch(err => { done(err); });
        }
		/* akasha.readDocumentEntry(metadata.documentPath, function(err, docEntry) {
			$('blog-next-prev').each(function(i, elem) { elements.push(elem); });
			if (elements.length > 0) {
				if (!blogcfg) {
					return done(new Error('No blog configuration found for blogtag '+ metadata.blogtag));
				} else {
					documents = findBlogDocs(config, metadata, blogcfg);
				}
			}
			async.eachSeries(elements, function(element, next) {
				// what's the current document
				// find it within documents
				var docIndex = -1;
				for (var j = 0; j < documents.length; j++) {
					if (documents[j].path === docEntry.path) {
						docIndex = j;
					}
				}
				if (docIndex >= 0) {
					var prevDoc = docIndex === 0 ? documents[documents.length - 1] : documents[docIndex - 1];
					var nextDoc = docIndex === documents.length - 1 ? documents[0] : documents[docIndex + 1];
					akasha.partial('blog-next-prev.html.ejs', {
						prevDoc: prevDoc, nextDoc: nextDoc, thisDoc: docEntry, documents: documents
					}, function(err, html) {
						if (err) next(err);
						else {
							$(element).replaceWith(html);
							next();
						}
					});
				} else {
					next(new Error('did not find document in blog'));
				}
				// prevDoc =
				// nextDoc =
				// akasha.partial('blog-next-prev.html.ejs', {
				//		prevDoc: prevDoc, nextDoc: nextDoc
				// })
				// next();
			},
			function(err) {
				if (err) done(err);
				else done();
			});
		}); */
    }
];