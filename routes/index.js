/*
 * Connect all of your endpoints together here.
 */
var express = require('express');
var homeRouter = require('./home');
var usersRouter = require('./users');
var tasksRouter = require('./tasks');


module.exports = function (app, router) {
    app.use('/', homeRouter(router)); 

    app.use('/api', usersRouter(router)); 
    app.use('/api', tasksRouter(router));

    //app.use('/api', require('./home.js')(router));

};
