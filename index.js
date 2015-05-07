/**
 *
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


var path     = require('path');
var util     = require('util');
var url      = require('url');
var async    = require('async');

var logger;
var akasha;
var config;

/**
 * Add ourselves to the config data.
 **/
module.exports.config = function(_akasha, _config) {
	akasha = _akasha;
	config = _config;
	logger = akasha.getLogger("blog-podcast");
    config.root_partials.push(path.join(__dirname, 'partials'));
    
	return module.exports;
};

var findBlogDocs = function(config, metadata, blogcfg) {
	var documents = akasha.findMatchingDocuments(blogcfg.matchers);
	
	documents.sort(function(a, b) {
		var aPublicationDate = Date.parse(
				a.frontmatter.yaml.publicationDate
			  ? a.frontmatter.yaml.publicationDate
			  : a.stat.mtime
		);
		var bPublicationDate = Date.parse(
				b.frontmatter.yaml.publicationDate
			  ? b.frontmatter.yaml.publicationDate
			  : b.stat.mtime
		);
		if (aPublicationDate < bPublicationDate) return -1;
		else if (aPublicationDate === bPublicationDate) return 0;
		else return 1;
	});
	documents.reverse();
	
	return documents;
};

module.exports.mahabhuta = [
	function($, metadata, dirty, done) {
		var elements = [];
		var documents, blogcfg;
		$('blog-news-river').each(function(i, elem) { elements.push(elem); });
		if (elements.length > 0) {
			blogcfg = config.blogPodcast[metadata.blogtag];
			documents = findBlogDocs(config, metadata, blogcfg);
		}
		async.eachSeries(elements, function(element, next) {
			if (! metadata.blogtag) {
				next(new Error("no blogtag"));
			} else if (! config.blogPodcast.hasOwnProperty(metadata.blogtag)) {
				next(new Error("no blogPodcast item for "+ metadata.blogtag));
			}
			
			// console.log(element.name +' '+ metadata.blogtag);
            
            var rssitems = [];
            for (var q = 0; q < documents.length; q++) {
                var doc = documents[q];
                rssitems.push({
                    title: doc.frontmatter.yaml.title,
                    description: doc.frontmatter.yaml.teaser ? doc.frontmatter.yaml.teaser : "",
                    url: config.root_url +'/'+ doc.renderedFileName,
                    date: doc.frontmatter.yaml.publicationDate
                        ? doc.frontmatter.yaml.publicationDate
                        : doc.stat.mtime
                });
            }
			
            var feedRenderTo = blogcfg.rssurl;
            akasha.generateRSS(blogcfg.rss, {
                    feed_url: config.root_url + feedRenderTo,
                    pubDate: new Date()
                },
                rssitems, feedRenderTo,	function(err) {
                    if (err) logger.error(err);
                });
            
            akasha.partial("blog-news-river.html.ejs", {
                documents: documents,
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
    },
	
	function($, metadata, dirty, done) {
		var elements = [];
		var documents;
		akasha.readDocumentEntry(metadata.documentPath, function(err, docEntry) {
			$('blog-next-prev').each(function(i, elem) { elements.push(elem); });
			if (elements.length > 0) {
				blogcfg = config.blogPodcast[metadata.blogtag];
				documents = findBlogDocs(config, metadata, blogcfg);
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
		});
    }
];