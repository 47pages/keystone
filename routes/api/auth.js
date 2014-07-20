var keystone = require('../../');

exports = module.exports = {
	permissionLevels: {
		admin: 10,
		editor: 9,
		senior: 8,
		junior: 6,
		copy: 4,
		design: 4,
		staff: 1
	},
	/**
	 * Performs an authentication check to see if a user can edit a model field
	 * @param  {Object} field
	 * @param  {Object} user
	 * @return {Boolean}
	 */
	canEditField: function (field, user) {
		switch (field.list.model.modelName) {
		case 'LiteratureSubmission':
			switch (field.label) {
			case 'Title':
				return user.isSeniorDesign || user.isSeniorLiterature || user.permissionLevel > this.permissionLevels.senior;
			case 'Edited Piece':
				return user.isJuniorLiterature || user.permissionLevel > this.permissionLevels.junior;
			case 'Status':
				return user.isSeniorDesign || user.isSeniorLiterature || user.permissionLevel > this.permissionLevels.senior;
			case 'Staff Meeting Assignment':
				return user.isSeniorDesign || user.isSeniorLiterature || user.permissionLevel > this.permissionLevels.senior;
			case 'Publish Online':
				return user.isSeniorDesign || user.isSeniorLiterature || user.permissionLevel > this.permissionLevels.senior;
			default:
				return true;
			}
			break;
		case 'ArtSubmission':
			switch (field.label) {
			case 'Title':
				return user.isSeniorDesign || user.isSeniorArt || user.permissionLevel > this.permissionLevels.senior;
			case 'Edited Image':
				return user.isJuniorArt || user.permissionLevel > this.permissionLevels.senior;
			case 'Status':
				return user.isSeniorDesign || user.isSeniorArt || user.permissionLevel > this.permissionLevels.senior;
			case 'Staff Meeting Assignment':
				return user.isSeniorDesign || user.isSeniorArt || user.permissionLevel > this.permissionLevels.senior;
			case 'Publish Online':
				return user.isSeniorDesign || user.isSeniorArt || user.permissionLevel > this.permissionLevels.senior;
			default:
				return true;
			}
			break;
		default:
			return true;
		}
	},
	/**
	 * Performs an authenication check to see if a user can see a field (used for hiding conditional data like author name)
	 * @param  {String} field
	 * @param  {Object} user
	 * @return {Boolean}
	 */
	canViewField: function (field, user) {
		switch (field.list.model.modelName) {
		case 'LiteratureSubmission':
			switch (field.label) {
			case 'Author':
				return user.isEditor || user.permissionLevel > this.permissionLevels.editor;
			case 'Contact Email':
				return user.isSeniorDesign || user.isSeniorLiterature || user.permissionLevel > this.permissionLevels.senior;
			default:
				return true;
			}
		case 'ArtSubmission':
			switch (field.label) {
			case 'Author':
				return user.isEditor || user.permissionLevel > this.permissionLevels.editor;
			case 'Contact Email':
				return user.isSeniorDesign || user.isSeniorArt || user.permissionLevel > this.permissionLevels.senior;
			default:
				return true;
			}
		default:
			return true;
		}
	}
	/**
	 * Performs an authentication check to see if a user can perform a given aciton on a model
	 * @param  {Object} model
	 * @param  {String} action Valid actions are 'view' and 'edit'
	 * @param  {Object} user
	 * @return {Boolean}
	 */
};


