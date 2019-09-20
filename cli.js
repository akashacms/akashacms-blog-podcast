#!/usr/bin/env node

/**
 *
 * Copyright 2014-2019 David Herron
 *
 * This file is part of AkashaCMS (http://akashacms.com/).
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
const path      = require('path');
const program   = require('commander');

process.title = 'akashacms-blog-podcast';
program.version('0.7.4');

program
    .command('cfg <configFN> <cfg>')
    .description('Print blog configuration')
    .action(async (configFN, cfg) => {
        try {
            const config = require(path.join(process.cwd(), configFN));
            const blogcfg = config.plugin('akashacms-blog-podcast').options.bloglist[cfg];
            console.log(blogcfg);
        } catch (e) {
            console.error(`cfg command ERRORED ${e.stack}`);
        }
    });

program
    .command('items <configFN> <cfg>')
    .description('Print items for blog')
    .action(async (configFN, cfg) => {
        try {
            const config = require(path.join(process.cwd(), configFN));
            const blogcfg = config.plugin('akashacms-blog-podcast').options.bloglist[cfg];
            const items = await config.plugin('akashacms-blog-podcast').findBlogDocs(config, blogcfg);
            for (let item of items) {
                console.log(`blog item ${cfg} `, item);
            }
        } catch (e) {
            console.error(`items command ERRORED ${e.stack}`);
        }
    });

program
    .command('index <configFN> <cfg>')
    .description('Print index for blog')
    .action(async (configFN, cfg) => {
        try {
            const config = require(path.join(process.cwd(), configFN));
            const blogcfg = config.plugin('akashacms-blog-podcast').options.bloglist[cfg];
            const indexes = await config.plugin('akashacms-blog-podcast').findBlogIndexes(config, blogcfg);
            for (let index of indexes) {
                console.log(`blog index ${cfg} `, index);
            }
        } catch (e) {
            console.error(`index command ERRORED ${e.stack}`);
        }
    });


program.parse(process.argv);
