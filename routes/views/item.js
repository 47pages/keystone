var keystone = require('../../'),
	_ = require('underscore'),
	async = require('async'),
	auth = require('../api/auth');

exports = module.exports = function(req, res) {

	req.list.model.findById(req.params.item).exec(function(err, item) {

		if (!item) {
			req.flash('error', 'Item ' + req.params.item + ' could not be found.');
			return res.redirect('/keystone/' + req.list.path);
		}

		var viewLocals = {
			validationErrors: {}
		};

		var renderView = function() {

			var relationships = _.values(_.compact(_.map(req.list.relationships, function(i) {
				if (i.isValid) {
					return _.clone(i);
				} else {
				    keystone.console.err('Relationship Configuration Error', 'Relationship: ' + i.path + ' on list: ' + req.list.key + ' links to an invalid list: ' + i.ref);
					return null;
				}
			})));


			var drilldown = {
				def: req.list.get('drilldown'),
				data: {},
				items: []
			};

			var loadDrilldown = function(cb) {

				if (!drilldown.def)
					return cb();

				// step back through the drilldown list and load in reverse order to support nested relationships
				// TODO: proper support for nested relationships in drilldown
				drilldown.def = drilldown.def.split(' ').reverse();

				async.eachSeries(drilldown.def, function(path, done) {

					var field = req.list.fields[path];

					if (!field || field.type !== 'relationship')
						throw new Error('Drilldown for ' + req.list.key + ' is invalid: field at path ' + path + ' is not a relationship.');

					var refList = field.refList;

					if (field.many) {
						if (!item.get(field.path).length) {
							return done();
						}
						refList.model.find().where('_id').in(item.get(field.path)).limit(4).exec(function(err, results) {
							if (err || !results) {
								done(err);
							}
							var more = (results.length === 4) ? results.pop() : false;
							if (results.length) {
								drilldown.data[path] = results;
								drilldown.items.push({
									list: refList,
									items: _.map(results, function(i) { return {
										label: refList.getDocumentName(i),
										href: '/keystone/' + refList.path + '/' + i.id
									};}),
									more: (more) ? true : false
								});
							}
							done();
						});
					} else {
						if (!item.get(field.path)) {
							return done();
						}
						refList.model.findById(item.get(field.path)).exec(function(err, result) {
							if (result) {
								drilldown.data[path] = result;
								drilldown.items.push({
									list: refList,
									label: refList.getDocumentName(result),
									href: '/keystone/' + refList.path + '/' + result.id
								});
							}
							done();
						});
					}

				}, function(err) {
					// put the drilldown list back in the right order
					drilldown.def.reverse();
					drilldown.items.reverse();
					cb(err);
				});
			};

			var loadRelationships = function(cb) {

				async.each(relationships, function(rel, done) {

					// TODO: Handle invalid relationship config
					rel.list = keystone.list(rel.ref);
					rel.sortable = (rel.list.get('sortable') && rel.list.get('sortContext') === req.list.key + ':' + rel.path);

					// TODO: Handle relationships with more than 1 page of results
					var q = rel.list.paginate({ page: 1, perPage: 100 })
						.where(rel.refPath).equals(item.id)
						.sort(rel.list.defaultSort);

					// rel.columns = _.reject(rel.list.defaultColumns, function(col) { return (col.type == 'relationship' && col.refList == req.list) });
					switch (rel.list.key) {
						case 'LiteratureSubmission':
							rel.columns = [
								rel.list.fields.title,
								rel.list.fields.originalPiece
							];
							break;
						case 'ArtSubmission':
							rel.columns = [
								rel.list.fields.title,
								rel.list.fields.originalImage
							];
							break;
						default:
							rel.columns = rel.list.defaultColumns;
							break;
					}
					rel.list.selectColumns(q, rel.columns);

					q.exec(function(err, results) {
						rel.items = results;
						done(err);
					});

				}, cb);
			};

			var	loadFormFieldTemplates = function(cb){
				var onlyFields = function(item) { return item.type === 'field'; };
				var compile = function(item, callback) { item.field.compile('form',callback); };
				async.eachSeries(req.list.uiElements.filter(onlyFields), compile , cb);
			};


			/** Render View */

			async.parallel([
				loadDrilldown,
				loadRelationships,
				loadFormFieldTemplates
			], function(err) {

				// TODO: Handle err

				var showRelationships = _.some(relationships, function(rel) {
					return rel.items.results.length;
				});

				var relationshipsTitle = 'Relationships';

				switch (req.list.model.modelName) {
				case 'Volume':
					relationshipsTitle = 'Pieces to Be Published';
					break;
				case 'Meeting':
					relationshipsTitle = 'Pieces to Review';
					break;
				}

				var hiddenUiElements = [],
					canEditModel = false;

				// Perform authentication on the model before rendering it
				for (var i = req.list.uiElements.length - 1; i >= 0; i--) {
					if (req.list.uiElements[i].type !== 'field') {
						continue;
					}

					var field = req.list.uiElements[i].field;

					// Modify each field's noedit property on-the-fly based on what each user is authenticated to edit
					if (
						auth.canViewField(field, req.user) &&
						!(!req.user.isAdmin && field.type === 'boolean' && field.path === 'isAdmin') // Protect granting of admin privs in User model
					) {
						field.options.pristineNoedit = field.options.noedit;
						field.options.noedit = field.options.pristineNoedit || !auth.canEditField(field, req.user);

						if (!field.options.noedit) {
							canEditModel = true;
						}
					}
					// Do not render any elements that the user isn't authenticated to view
					else {
						hiddenUiElements.push(req.list.uiElements[i]);
						req.list.uiElements.splice(i, 1);
					}
				}

				req.list.options.pristineNoedit = req.list.options.noedit;
				req.list.options.noedit = !canEditModel;

				keystone.render(req, res, 'item', _.extend(viewLocals, {
					section: keystone.nav.by.list[req.list.key] || {},
					title: 'Keystone: ' + req.list.singular + ': ' + req.list.getDocumentName(item),
					page: 'item',
					list: req.list,
					item: item,
					relationships: relationships,
					showRelationships: showRelationships,
					relationshipsTitle: relationshipsTitle,
					drilldown: drilldown
				}));

				// Restore the default noedit properties on the fields for the next request
				req.list.uiElements.forEach(function (element, index) {
					if (element.type !== 'field') {
						return;
					}

					element.field.options.noedit = element.field.options.pristineNoedit;
				});

				// Restore the default noedit property on the model for the next request
				req.list.options.noedit = req.list.options.pristineNoedit;

				// Restore the hidden ui elements for the next request
				// TODO: Less hacky way of reappending these... the order gets messed up
				req.list.uiElements = req.list.uiElements.concat(hiddenUiElements);

			});

		};

		if (req.method === 'POST' && req.body.action === 'accountUpdate') {
			if (!keystone.security.csrf.validate(req)) {
				req.flash('error', 'There was a problem with your request, please try again.');
				return renderView();
			}

			item.getUpdateHandler(req).process(
				req.body,
				{
					flashErrors: true,
					logErrors: true
				},
				function (err) {
					if (err) {
						return renderView();
					}
					req.flash('success', 'Your changes have been saved.');
					return res.redirect('/keystone/account_manager');
				}
			);
		}
		else if (!auth.canViewModel(req.list, req.user)) {
			req.flash('error', 'Error: 403. You do not have the permissionLevel to access the page: "' + req.path + '".');
			return res.redirect(403, '/keystone');
		}
		else if (req.method === 'POST' && req.body.action === 'updateItem' && !req.list.get('noedit')) {
			if (!keystone.security.csrf.validate(req)) {
				req.flash('error', 'There was a problem with your request, please try again.');
				return renderView();
			}

			item.getUpdateHandler(req).process(req.body, { flashErrors: true, logErrors: true }, function(err) {
				if (err) {
					return renderView();
				}
				req.flash('success', 'Your changes have been saved.');
				return res.redirect('/keystone/' + req.list.path + '/' + item.id);
			});
		} else {
			renderView();
		}

	});

};
