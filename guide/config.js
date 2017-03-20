'use strict';

const util    = require('util');
const akasha  = require('akasharender');
const path    = require('path');

const log    = require('debug')('akasharender-docs:configuration');
const error  = require('debug')('akasharender-docs:error-configuration');

const config = new akasha.Configuration();

config.rootURL("https://blog-podcast.akashacms.com/");

config
    .addAssetsDir('assets')
    .addAssetsDir({
        src: 'node_modules/bootstrap/dist',
        dest: 'vendor/bootstrap'
    })
   .addAssetsDir({
        src: 'node_modules/jquery/dist',
        dest: 'vendor/jquery'
    })
    .addLayoutsDir('layouts')
    .addDocumentsDir('documents')
    .addPartialsDir('partials')
    .setRenderDestination('out');

config
    .addMetadata('siteLogoImage', 'http://akashacms.com/logo.gif')
    .addMetadata('siteLogoWidth', '100px');

config
    .use(require('akashacms-theme-bootstrap'))
    .use(require('akashacms-base'))
    .use(require('akashacms-breadcrumbs'))
    .use(require('akashacms-booknav'));
    // .use(require('epub-website'));

config.plugin("akashacms-base").generateSitemap(config, true);

config
    .addFooterJavaScript({ href: "/vendor/jquery/jquery.min.js" })
    .addFooterJavaScript({ href: "/vendor/bootstrap/js/bootstrap.min.js"  })
    .addStylesheet({       href: "/vendor/bootstrap/css/bootstrap.min.css" })
    .addStylesheet({       href: "/vendor/bootstrap/css/bootstrap-theme.min.css" })
    .addStylesheet({       href: "/style.css" });

config.setMahabhutaConfig({
    recognizeSelfClosing: true,
    recognizeCDATA: true,
    xmlMode: false
});

config.prepare();
module.exports = config;
