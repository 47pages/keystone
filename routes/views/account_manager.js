var keystone = require('../../');

exports = module.exports = function (req, res) {

	var account = {};
	account.uiElements = [];

	// Build out the account object with the properties we want to display to the user
	req.user.list.uiElements.forEach(function (element, index) {
		if (element.type === 'heading') {
			account.uiElements.push(element);
			return;
		}
		else if (element.type !== 'field') {
			return;
		}

		element.field.options.pristineNoedit = element.field.options.noedit;

		// Explicitly define which fields can be viewed
		if (element.field.label === 'Name' ||
			element.field.label === 'Email' ||
			element.field.label === 'Password' ||
			element.field.type === 'boolean' && req.user.get(element.field.path) === true // Permissions
		) {
			element.field.options.noedit = true; // Default to not allowing editing of any property
			element.field.options.accountView = true; // Custom presentation of field in the template
			account.uiElements.push(element);
		}

		// Explicitly define which fields can be edited
		if (element.field.label === 'Password') {
			element.field.options.noedit = false;
		}
	});

	keystone.render(req, res, 'account_manager', {
		account: account
	});

	// Restore the default noedit properties on the fields for the next request
	req.user.list.uiElements.forEach(function (element, index) {
		if (element.type !== 'field') {
			return;
		}

		element.field.options.noedit = element.field.options.pristineNoedit;
	});
};
