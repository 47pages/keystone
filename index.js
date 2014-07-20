var fs = require('fs'),
	path = require('path'),
	http = require('http'),
	https = require('https'),
	_ = require('underscore'),
	express = require('express'),
	async = require('async'),
	jade = require('jade'),
	moment = require('moment'),
	numeral = require('numeral'),
	cloudinary = require('cloudinary'),
	mandrillapi = require('mandrill-api'),
	utils = require('keystone-utils');

var templateCache = {};

var dashes = '\n------------------------------------------------\n';

/**
 * Don't use process.cwd() as it breaks module encapsulation
 * Instead, let's use module.parent if it's present, or the module itself if there is no parent (probably testing keystone directly if that's the case)
 * This way, the consuming app/module can be an embedded node_module and path resolutions will still work
 * (process.cwd() breaks module encapsulation if the consuming app/module is itself a node_module)
 */
var moduleRoot = (function(_rootPath) {
	var parts = _rootPath.split(path.sep);
	parts.pop(); //get rid of /node_modules from the end of the path
	return parts.join(path.sep);
})(module.parent ? module.parent.paths[0] : module.paths[0]);


/**
 * Keystone Class
 *
 * @api public
 */

var Keystone = function() {

	this.lists = {};
	this.paths = {};
	this._options = {
		'name': 'Keystone',
		'brand': 'Keystone',
		'compress': true,
		'headless': false,
		'logger': 'dev',
		'auto update': false,
		'model prefix': null
	};
	this._pre = {
		routes: [],
		render: []
	};
	this._redirects = {};

	// expose express

	this.express = express;


	// init environment defaults

	this.set('env', process.env.NODE_ENV || 'development');

	this.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT);
	this.set('host', process.env.HOST || process.env.IP || process.env.OPENSHIFT_NODEJS_IP);
	this.set('listen', process.env.LISTEN);

	this.set('ssl', process.env.SSL);
	this.set('ssl port', process.env.SSL_PORT);
	this.set('ssl host', process.env.SSL_HOST || process.env.SSL_IP);
	this.set('ssl key', process.env.SSL_KEY);
	this.set('ssl cert', process.env.SSL_CERT);

	this.set('cookie secret', process.env.COOKIE_SECRET);
	this.set('cookie signin', (this.get('env') === 'development') ? true : false);

	this.set('embedly api key', process.env.EMBEDLY_API_KEY || process.env.EMBEDLY_APIKEY);
	this.set('mandrill api key', process.env.MANDRILL_API_KEY || process.env.MANDRILL_APIKEY);
	this.set('mandrill username', process.env.MANDRILL_USERNAME);
	this.set('google api key', process.env.GOOGLE_BROWSER_KEY);
	this.set('google server api key', process.env.GOOGLE_SERVER_KEY);
	this.set('ga property', process.env.GA_PROPERTY);
	this.set('ga domain', process.env.GA_DOMAIN);
	this.set('chartbeat property', process.env.CHARTBEAT_PROPERTY);
	this.set('chartbeat domain', process.env.CHARTBEAT_DOMAIN);
	this.set('allowed ip ranges', process.env.ALLOWED_IP_RANGES);

	if (process.env.S3_BUCKET && process.env.S3_KEY && process.env.S3_SECRET) {
		this.set('s3 config', { bucket: process.env.S3_BUCKET, key: process.env.S3_KEY, secret: process.env.S3_SECRET, region: process.env.S3_REGION });
	}

	if (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_ACCESS_KEY) {
		this.set('azurefile config', { account: process.env.AZURE_STORAGE_ACCOUNT, key: process.env.AZURE_STORAGE_ACCESS_KEY });
	}

	if (process.env.CLOUDINARY_URL) {
		// process.env.CLOUDINARY_URL is processed by the cloudinary package when this is set
		this.set('cloudinary config', true);
	}

	// Attach middleware modules
	this.initAPI = require('./lib/middleware/initAPI')(this);

};

_.extend(Keystone.prototype, require('./lib/core/options')(moduleRoot));


/**
 * Registers a pre-event handler.
 *
 * Valid events include:
 * - `routes` - calls the function before any routes are matched, after all other middleware
 *
 * @param {String} event
 * @param {Function} function to call
 * @api public
 */

Keystone.prototype.pre = function(event, fn) {
	if (!this._pre[event]) {
		throw new Error('keystone.pre() Error: event ' + event + ' does not exist.');
	}
	this._pre[event].push(fn);
	return this;
};


/**
 * Connects keystone to the application's mongoose instance.
 *
 * ####Example:
 *
 *     var mongoose = require('mongoose');
 *
 *     keystone.connect(mongoose);
 *
 * @param {Object} connections
 * @api public
 */

Keystone.prototype.connect = function() {
	// detect type of each argument
	for (var i = 0; i < arguments.length; i++) {
		if (arguments[i].constructor.name === 'Mongoose') {
			// detected Mongoose
			this.mongoose = arguments[i];
		} else if (arguments[i].name === 'app') {
			// detected Express app
			this.app = arguments[i];
		}
	}
	return this;
};

Keystone.prototype.prefixModel = function (key) {
	var modelPrefix = this.get('model prefix');

	if (modelPrefix)
		key = modelPrefix + '_' + key;

	return require('mongoose/lib/utils').toCollectionName(key);
};

/* Attach core functionality to Keystone.prototype */
Keystone.prototype.init = require('./lib/core/init');
Keystone.prototype.initNav = require('./lib/core/initNav');
Keystone.prototype.start = require('./lib/core/start');
Keystone.prototype.mount = require('./lib/core/mount');
Keystone.prototype.routes = require('./lib/core/routes');
Keystone.prototype.static = require('./lib/core/static');
Keystone.prototype.createItems = require('./lib/core/createItems');
Keystone.prototype.redirect = require('./lib/core/redirect');
Keystone.prototype.bindEmailTestRoutes = require('./lib/core/bindEmailTestRoutes');


/**
 * The exports object is an instance of Keystone.
 *
 * @api public
 */

var keystone = module.exports = exports = new Keystone();

// Expose modules and Classes
keystone.utils = utils;
keystone.content = require('./lib/content');
keystone.List = require('./lib/list');
keystone.Field = require('./lib/field');
keystone.Field.Types = require('./lib/fieldTypes');
keystone.View = require('./lib/view');
keystone.Email = require('./lib/email');

var security = keystone.security = {
	csrf: require('./lib/security/csrf')
};


/**
 * Adds bindings for keystone static resources
 * Can be included before other middleware (e.g. session management, logging, etc) for
 * reduced overhead
 *
 * @param {Express()} app
 * @api public
 */

Keystone.prototype.static = function(app) {

	app.use('/keystone', require('less-middleware')(__dirname + path.sep + 'public'));
	app.use('/keystone', express.static(__dirname + path.sep + 'public'));

	return this;

};


/**
 * Adds bindings for the keystone routes
 *
 * ####Example:
 *
 *     var app = express();
 *     app.configure(...); // configuration settings
 *     app.use(...); // middleware, routes, etc. should come before keystone is initialised
 *     keystone.routes(app);
 *
 * @param {Express()} app
 * @api public
 */

Keystone.prototype.routes = function(app) {

	this.app = app;
	var keystone = this;

	// ensure keystone nav has been initialised
	if (!this.nav) {
		this.nav = this.initNav();
	}

	// Cache compiled view templates if we are in Production mode
	this.set('view cache', this.get('env') === 'production');

	// Bind auth middleware (generic or custom) to /keystone* routes, allowing
	// access to the generic signin page if generic auth is used

	if (this.get('auth') === true) {

		if (!this.get('signout url')) {
			this.set('signout url', '/keystone/signout');
		}
		if (!this.get('signin url')) {
			this.set('signin url', '/keystone/signin');
		}

		if (!this.nativeApp || !this.get('session')) {
			app.all('/keystone*', this.session.persist);
		}

		app.all('/keystone/signin', require('./routes/views/signin'));
		app.all('/keystone/signout', require('./routes/views/signout'));
		app.all('/keystone*', this.session.keystoneAuth);

	} else if ('function' === typeof this.get('auth')) {
		app.all('/keystone*', this.get('auth'));
	}

	// Restrict access to the private directory (serves private static files)
	app.all('/private/*', require('./lib/middleware/requireUser'));

	var initList = function(protect) {
		return function(req, res, next) {
			req.list = keystone.list(req.params.list);
			if (!req.list || (protect && req.list.get('hidden'))) {
				req.flash('error', 'List ' + req.params.list + ' could not be found.');
				return res.redirect('/keystone');
			}
			next();
		};
	};

	// Keystone Admin Route
	app.all('/keystone', require('./routes/views/home'));

	// Email test routes
	if (this.get('email tests')) {
		this.bindEmailTestRoutes(app, this.get('email tests'));
	}

	// Cloudinary API for image uploading (only if Cloudinary is configured)
	if (keystone.get('wysiwyg cloudinary images')) {
		if (!keystone.get('cloudinary config')) {
			throw new Error('KeystoneJS Initialisaton Error:\n\nTo use wysiwyg cloudinary images, the \'cloudinary config\' setting must be configured.\n\n');
		}
		app.post('/keystone/api/cloudinary/upload', require('./routes/api/cloudinary').upload);
	}

	// Generic Lists API
	app.all('/keystone/api/:list/:action', initList(), require('./routes/api/list'));

	// Generic Lists Download Route
	app.all('/keystone/download/:list', initList(), require('./routes/download/list'));

	// List and Item Details Admin Routes
	app.all('/keystone/:list/:page([0-9]{1,5})?', initList(true), require('./routes/views/list'));
	app.all('/keystone/:list/:item', initList(true), require('./routes/views/item'));

	return this;

};


Keystone.prototype.bindEmailTestRoutes = function(app, emails) {

	var keystone = this;

	var handleError = function(req, res, err) {
		if (res.err) {
			res.err(err);
		} else {
			// TODO: Nicer default error handler
			res.status(500).send(JSON.stringify(err));
		}
	};

	// TODO: Index of email tests, and custom email test 404's (currently bounces to list 404)

	_.each(emails, function(vars, key) {

		var render = function(err, req, res, locals) {
			new keystone.Email(key).render(locals, function(err, email) {
				if (err) {
					handleError(req, res, err);
				} else {
					res.send(email.html);
				}
			});
		};

		app.get('/keystone/test-email/' + key, function(req, res) {
			if ('function' === typeof vars) {
				vars(req, res, function(err, locals) {
					render(err, req, res, locals);
				});
			} else {
				render(null, req, res, vars);
			}
		});

	});

	return this;

};


/**
 * Adds one or more redirections (urls that are redirected when no matching
 * routes are found, before treating the request as a 404)
 *
 * #### Example:
 * 		keystone.redirect('/old-route', 'new-route');
 *
 * 		// or
 *
 * 		keystone.redirect({
 * 			'old-route': 'new-route'
 * 		});
 */

Keystone.prototype.redirect = function() {

	if (arguments.length === 1 && utils.isObject(arguments[0])) {
		_.extend(this._redirects, arguments[0]);
	} else if (arguments.length === 2 && 'string' === typeof arguments[0] && 'string' === typeof arguments[1]) {
		this._redirects[arguments[0]] = arguments[1];
	}

	return this;

};


/**
 * Returns a function that looks in a specified path relative to the current
 * directory, and returns all .js modules it (recursively).
 *
 * ####Example:
 *
 *     var importRoutes = keystone.importer(__dirname);
 *
 *     var routes = {
 *         site: importRoutes('./site'),
 *         api: importRoutes('./api')
 *     };
 *
 * @param {String} rel__dirname
 * @api public
 */

Keystone.prototype.importer = function(rel__dirname) {

	var importer = function(from) {
		var imported = {};
		var joinPath = function() {
			return '.' + path.sep + path.join.apply(path, arguments);
		};
		var fsPath = joinPath(path.relative(process.cwd(), rel__dirname), from);
		fs.readdirSync(fsPath).forEach(function(name) {
			var info = fs.statSync(path.join(fsPath, name));
			// recur
			if (info.isDirectory()) {
				imported[name] = importer(joinPath(from, name));
			} else {
				// only import .js files
				var parts = name.split('.');
				var ext = parts.pop();
				if (ext === 'js' || ext === 'coffee') {
					imported[parts.join('-')] = require(path.join(rel__dirname, from, name));
				}
			}
			return imported;
		});
		return imported;
	};

	return importer;

};


/**
 * returns all .js modules (recursively) in the path specified, relative
 * to the module root (where the keystone project is being consumed from).
 *
 * ####Example:
 *
 *     var models = keystone.import('models');
 *
 * @param {String} dirname
 * @api public
 */

Keystone.prototype.import = function(dirname) {

	var initialPath = path.join(moduleRoot, dirname);

	var doImport = function(fromPath) {

		var imported = {};

		fs.readdirSync(fromPath).forEach(function(name) {

			var fsPath = path.join(fromPath, name),
			info = fs.statSync(fsPath);

			// recur
			if (info.isDirectory()) {
				imported[name] = doImport(fsPath);
			} else {
				// only import .js or .coffee files
				var parts = name.split('.');
				var ext = parts.pop();
				if (ext === 'js' || ext === 'coffee') {
					imported[parts.join('-')] = require(fsPath);
				}
			}

		});

		return imported;
	};

	return doImport(initialPath);
};


/**
 * Registers or retrieves a list
 */

Keystone.prototype.list = function(list) {
	if (list && list.constructor === keystone.List) {
		this.lists[list.key] = list;
		this.paths[list.path] = list.key;
		return list;
	}
	return this.lists[list] || this.lists[this.paths[list]];
};


/**
 * Retrieves orphaned lists (those not in a nav section)
 */

Keystone.prototype.getOrphanedLists = function() {
	if (!this.nav) {
		return [];
	}
	return _.filter(this.lists, function(list, key) {
		if (list.get('hidden')) return false;
		return (!keystone.nav.by.list[key]) ? list : false;
	});
};


/**
 * Applies Application updates
 */

Keystone.prototype.applyUpdates = function(callback) {
	require('./lib/updates').apply(callback);
};


/**
 * Renders a Keystone View
 *
 * @api private
 */

Keystone.prototype.render = function(req, res, view, ext) {

	var keystone = this;

	var templatePath = __dirname + '/templates/views/' + view + '.jade';

	var jadeOptions = {
		filename: templatePath,
		pretty: keystone.get('env') !== 'production'
	};

	// TODO: Allow custom basePath for extensions... like this or similar
	// if (keystone.get('extensions')) {
	// 	jadeOptions.basedir = keystone.getPath('extensions') + '/templates';
	// }

	var compileTemplate = function() {
		return jade.compile(fs.readFileSync(templatePath, 'utf8'), jadeOptions);
	};

	var template = this.get('viewCache')
		? templateCache[view] || (templateCache[view] = compileTemplate())
		: compileTemplate();

	var flashMessages = {
		info: res.req.flash('info'),
		success: res.req.flash('success'),
		warning: res.req.flash('warning'),
		error: res.req.flash('error'),
		hilight: res.req.flash('hilight')
	};

	var locals = {
		_: _,
		moment: moment,
		numeral: numeral,
		env: this.get('env'),
		brand: keystone.get('brand'),
		nav: keystone.nav,
		messages: _.any(flashMessages, function(msgs) { return msgs.length; }) ? flashMessages : false,
		lists: keystone.lists,
		js: 'javascript:;',
		utils: utils,
		user: req.user,
		title: 'Keystone',
		signout: this.get('signout url'),
		backUrl: this.get('back url') || '/',
		section: {},
		version: this.version,
		csrf_token_key: keystone.security.csrf.TOKEN_KEY,
		csrf_token_value: keystone.security.csrf.getToken(req, res),
		csrf_query: '&' + keystone.security.csrf.TOKEN_KEY + '=' + keystone.security.csrf.getToken(req, res),
		ga: {
			property: this.get('ga property'),
			domain: this.get('ga domain')
		},
		wysiwygOptions: {
			enableImages: keystone.get('wysiwyg images') ? true : false,
			enableCloudinaryUploads: keystone.get('wysiwyg cloudinary images') ? true : false,
			additionalButtons: keystone.get('wysiwyg additional buttons') || ''
		}
	};

	// optional extensions to the local scope
	_.extend(locals, ext);

	// add cloudinary locals if configured
	if (keystone.get('cloudinary config')) {
		try {
			var cloudinaryUpload = cloudinary.uploader.direct_upload();
			locals.cloudinary = {
				cloud_name: keystone.get('cloudinary config').cloud_name,
				api_key: keystone.get('cloudinary config').api_key,
				timestamp: cloudinaryUpload.hidden_fields.timestamp,
				signature: cloudinaryUpload.hidden_fields.signature,
				prefix: keystone.get('cloudinary prefix') || '',
				uploader: cloudinary.uploader
			};
			locals.cloudinary_js_config = cloudinary.cloudinary_js_config();
		} catch(e) {
			if (e === 'Must supply api_key') {
				throw new Error('Invalid Cloudinary Config Provided\n\n' +
					'See http://keystonejs.com/docs/configuration/#cloudinary for more information.');
			} else {
				throw e;
			}
		}
	}

	// fieldLocals defines locals that are provided to each field's `render` method
	locals.fieldLocals = _.pick(locals, '_', 'moment', 'numeral', 'env', 'js', 'utils', 'user', 'cloudinary');

	var html = template(_.extend(locals, ext));

	res.send(html);
};

/**
 * Populates relationships on a document or array of documents
 *
 * WARNING: This is currently highly inefficient and should only be used in development, or for
 * small data sets. There are lots of things that can be done to improve performance... later.
 *
 * @api public
 */

Keystone.prototype.populateRelated = function(docs, relationships, callback) {

	if (Array.isArray(docs)) {
		async.each(docs, function(doc, done) {
			doc.populateRelated(relationships, done);
		}, callback);
	} else if (docs && docs.populateRelated) {
		docs.populateRelated(relationships, callback);
	} else {
		callback();
	}

};

/**
 * Wraps an error in simple HTML to be sent as a response to the browser
 *
 * @api public
 */

Keystone.prototype.wrapHTMLError = function(title, err) {
	return '<html><head><meta charset=\'utf-8\'><title>Error</title>' +
	'<link rel=\'stylesheet\' href=\'/keystone/styles/error.css\'>' +
	'</head><body><div class=\'error\'><h1 class=\'error-title\'>' + title + '</h1>' + "<div class='error-message'>" + (err || '') + "</div></div></body></html>";
};

/**
 * Logs a configuration error to the console
 *
 * @api public
 */

Keystone.prototype.console = {};
Keystone.prototype.console.err = function(type, msg) {

	if (keystone.get('logger')) {
		var dashes = '\n------------------------------------------------\n';
		console.log(dashes + 'KeystoneJS: ' + type + ':\n\n' + msg + dashes);
	}

};

/**
 * Keystone version
 *
 * @api public
 */

keystone.version = require('./package.json').version;


// Expose Modules
keystone.session = require('./lib/session');
