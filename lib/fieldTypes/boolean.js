/*!
 * Module dependencies.
 */

var util = require('util'),
	utils = require('keystone-utils'),
	super_ = require('../field');

/**
 * Boolean FieldType Constructor
 * @extends Field
 * @api public
 */

function boolean(list, path, options) {
	this._nativeType = Boolean;
	this.indent = (options.indent) ? true : false;
	boolean.super_.call(this, list, path, options);
}

/*!
 * Inherit from Field
 */

util.inherits(boolean, super_);


/**
 * Validates that a truthy value for this field has been provided in a data object.
 *
 * Useful for checkboxes that are required to be true (e.g. agreed to terms and cond's)
 *
 * @api public
 */

boolean.prototype.validateInput = function(data, required) {
	if (required) {
		return (data[this.path] === true || data[this.path] === 'true') ? true : false;
	} else {
		return true;
	}
};


/**
 * Updates the value for this field in the item from a data object.
 * Only updates the value if it has changed.
 * Treats a true boolean or string == 'true' as true, everything else as false.
 *
 * @api public
 */

boolean.prototype.updateItem = function(item, data, req) {
	// TODO: Less hacky way of doing this
	// The W3 spec *stupidly* prescribes that browsers should only send form data for <input type="checkbox"> elements
	// when the checkbox value is true. So if the checkbox is false, nothing is sent. That's not okay! There are other
	// scenarios in which nothing is sent, but that say NOTHING about the state of the checkbox. Utter stupidity. One of
	// those situations is when we are performing an account update action. If no checkbox data is sent, we can't
	// assume that means that the checkbox was set to false. It might not have been updated at all! So we check the body
	// action to see if it was indeed an accountUpdate call and ignore the ambiguous case of no data being sent.
	if (!(this.path in data) && req.body.action === 'accountUpdate') {
		return;
	}

	if (data[this.path] === true || data[this.path] === 'true') {
		if (!item.get(this.path))
			item.set(this.path, true);
	} else if (item.get(this.path)) {
		item.set(this.path, false);
	}

};


/*!
 * Export class
 */

exports = module.exports = boolean;
