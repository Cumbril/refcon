/**
 * Reference Organizer is a Wikipedia gadget for organizing references in articles. With the gadget,
 * you can easily move all references into reference list template, or vice versa. You can select which references
 * to move based on citation count, or select references individually. The gadget detects all article's references 
 * and lists them in a table, where you can see their current location (in reference list template or in article text),
 * sort references in various ways, and rename them.
 * 
 * Copyright 2016–2017 Cumbril
 *
 * Some parts of RefCon are derived from Wikipedia gadget ProveIt. Credit for these parts goes to:
 * Copyright 2008-2011 Georgia Tech Research Corporation, Atlanta, GA 30332-0415, ALL RIGHTS RESERVED
 * Copyright 2011- Matthew Flaschen
 * Rewritten, internationalized, enhanced and maintained by Felipe Schenone since 2014
 *
 * RefCon is available under the GNU Free Documentation License (http://www.gnu.org/copyleft/fdl.html),
 * the Creative Commons Attribution/Share-Alike License 3.0 (http://creativecommons.org/licenses/by-sa/3.0/),
 * and the GNU General Public License 2 (http://www.gnu.org/licenses/gpl-2.0.html)
 */

( function ( mw, $ ) {

var refcon = {

	/**
	 * This variable holds edit textbox text that is modified throughout the script
	 *
	 * @type {string}
	 */
	textBoxText: '',

	/**
	 * This array holds reference template groups in the order that they appear in article
	 *
	 * @type {array}
	 */
	templateGroups: [],

	/**
	 * This array holds reference templates in the order that they appear in article
	 *
	 * @type {array}
	 */

	refTemplates: [],

	/**
	 * This array holds article text parts that are between reference templates
	 *
	 * @type {array}
	 */

	textParts: [],

	/**
	 * Object for user selectable sort options
	 *
	 * @type {object}
	 */

	userOptions: {},

	/**
	 * Convenience method to get a RefCon option
	 *
	 * @param {string} option key without the "refcon-" prefix
	 * @return {string} option value
	 */
	getOption: function ( key ) {
		return mw.config.get( 'refcon-' + key );
	},

	/**
	 * Convenience method to get a RefCon message
	 *
	 * @param {string} message key without the "refcon-" prefix
	 * @param {array} array of replacements
	 * @return {string} message value
	 */
	getMessage: function ( key, param ) {
		return new mw.Message( mw.messages, 'refcon-' + key, param ).text();
	},

	/**
	 * Convenience method to get the edit textbox
	 *
	 * @return {jQuery} edit textbox
	 */
	getTextbox: function () {
		return $( '#wpTextbox1' );
	},

	/**
	 * Initialization. Sets up script execution link. If the link is clicked, calls main function
	 *
	 * @return {void}
	 */
	init: function () {

		$([ refcon.getOption( 'image-yes' ),
			refcon.getOption( 'image-no' )
		]).each( function() {
				$('<img/>')[0].src = this;
			});

		var linkname = refcon.getOption( 'linkname' ), 
			linkhover = refcon.getOption( 'linkhover' );

		// Add portlet link to the script
		if ( document.getElementById( 'ca-edit' ) ) {
			var url = mw.util.getUrl( mw.config.get ( 'wgPageName' ), { action: 'edit', RefCon: 'true' });
			var portletlink = $( mw.util.addPortletLink (
				'p-cactions',
				url,
				linkname,
				'ca-RefCon',
				linkhover,
				'',
				document.getElementById( 'ca-move' )
			));
			// If the portlet link is clicked while on edit page, run the function and do stuff, don't load new page
			if( typeof document.forms.editform !== 'undefined' ) {
				portletlink.on('click', function (e) {
					e.preventDefault();
					refcon.main();
				});
			}
		}

		// Only load when editing
		var action = mw.config.get( 'wgAction' );

		if ( action === 'edit' || action === 'submit' ) {
			// Only if the portlet link was clicked
			if ( mw.util.getParamValue('RefCon') ) {
				 // Only if there is wpTextbox1 on the page
				if ( document.getElementById('wpTextbox1') ) {
					refcon.main();
				}
			}
		}
	},

	/**
	 * Main function. Calls specific subfunctions
	 *
	 * @return {void}
	 */
	main: function () {
		// This is a container function that calls subfunctions and passes their return values to other subfunctions

		// First, get indexes of reference templates in article, if there are any
		var indexes = refcon.parseIndexes(), i;

		if ( indexes.length > 0 ) {

			var templateDataList = [], templatesString = '';

			// Go through indexes array
			for ( i = 0; i < indexes.length; i++ ) {
				var refStartIndex = indexes[ i ];
				var nextRefStartIndex = indexes[ i + 1 ] ? indexes[ i + 1 ] : refcon.textBoxText.length;

				var templateData = refcon.getTemplateContent( refStartIndex, nextRefStartIndex, i );

				// don't do anything with the reference template if it is not closed
				if ( templateData['refEndIndex'] !== null ) {
					templatesString += templateData['templateContent'];
					templateDataList.push( templateData );
				}
			}

			// Use mw.API to get reflist templates parameter pairs
			var paramPairsList = refcon.getTemplateParams( templatesString );

			for ( i = 0; i < templateDataList.length; i++ ) {
				var paramsPair = typeof paramPairsList[ i ] !== 'undefined' ? paramPairsList[ i ] : {};
				var refTemplate = refcon.getTemplateObject( templateDataList[ i ], paramsPair );
				refcon.parseTemplateRefs( refTemplate );
			}

			// Go through refTemplates array (refTemplates determine the boundaries) and create an array of TextPart objects
			// These are text parts of an article that are located between reference templates

			refcon.storeTextParts();

			// Process references in reference templates, remove duplicate keys and values

			for ( i = 0; i < refcon.refTemplates.length; i++ ) {
				refcon.refTemplates[ i ].processDuplicates();
			}

			// Find and store references and citations in each textPart object

			for ( i = 0; i < refcon.textParts.length; i++ ) {
				refcon.parseTextParts( refcon.textParts[ i ] );
			}

			// Compare references to the ones in reference template(s). Add text part references into reference template.
			// Create citations to references.

			for ( i = 0; i < refcon.textParts.length; i++ ) {
				refcon.processTextPartRefs( refcon.textParts[ i ] );
			}

			// Link textPart citations to references

			for ( i = 0; i < refcon.textParts.length; i++ ) {
				refcon.linkCitations( refcon.textParts[ i ] );
			}

			// Show form with references
			refcon.showForm();

		} else {
			refcon.showDifferenceView();
		}
	},

	/**
	 * Continue processing after form. Commit changes and show the differences view
	 *
	 * @return {void}
	 */
	commit: function () {

			// Recreate indexes (because names could have been changed in the form)
			for ( i = 0; i < refcon.refTemplates.length; i++ ) {
				refcon.refTemplates[ i ].reIndex();
			}

			// Replace references inside text part strings with citations
			for ( i = 0; i < refcon.textParts.length; i++ ) {
				refcon.replaceTextPartRefs( refcon.textParts[ i ] );
			}
			// Build reference templates
			for ( i = 0; i < refcon.refTemplates.length; i++ ) {
				refcon.buildRefTemplates( refcon.refTemplates[ i ] );
			}
			var newText = refcon.writeTextBoxText();
			var textbox = refcon.getTextbox();
			var oldText = textbox.val();

			if ( oldText != newText ) {
				// Update textbox
				textbox.val( newText );
				// Add summary
				refcon.addSummary();
			}
			refcon.showDifferenceView();
	},

	/**
	 * Show form with references
	 *
	 * @return {void}
	 */
	showForm: function () {

		// Define basic elements
		var gui = $( '<div>' ).attr( 'id', 'refcon' ),
			container = $( '<div>' ).attr( 'id', 'refcon-container' ),
			header = $( '<div>' ).attr( 'id', 'refcon-header' ),
			title = $( '<span>' ).attr( 'id', 'refcon-title' ).text( refcon.getOption( 'gadgetname' ) ),
			closer = $( '<div>' ).attr( 'id', 'refcon-close' ).addClass( 'refcon-abort' ).html( '&times;' ).attr('title', refcon.getMessage( 'closetitle' )),
			content = $( '<div>' ).attr( 'id', 'refcon-content' ),
			form = $( '<form>' ).attr( 'id', 'refcon-form' ),
			table = $( '<table>' ).attr( 'id', 'refcon-table' );

		// Put everything together and add it to DOM
		header.append( title, closer );
		content.append( form ).append( table );
		container.append( header, content );
		gui.append( container );
		$( 'body' ).prepend( gui );

		// Make GUI draggable
		container.draggable({
			handle: header
		});

		// Set GUI width and height to 80% of user's window size (fallback is CSS-predefined values, if this fails)
		var width = $(window).width();
		var height = $(window).height();
		if ( ( Number.isInteger( width ) && width > 0 ) && ( Number.isInteger( height ) && height > 0 ) ) {
			content.css("width", Math.floor( width * 0.8 ));
			content.css("height", Math.floor( height * 0.8 ));
		}

		// Build table and fill it with reference data
		table.append('<tr>\
					<th></th>\
					<th class="refcon-sortable refcon-asc"><span>#</span></th>\
					<th class="refcon-sortable"><span>'+refcon.getMessage( 'name' )+'</span></th>\
					<th class="refcon-sortable"><span>'+refcon.getMessage( 'reference' )+'</span></th>\
					<th class="refcon-sortable"><span>'+refcon.getMessage( 'referenceuses' )+'</span></th>\
					<th></th>\
					</tr>');

		var i;
		for ( i = 0; i < refcon.refTemplates.length; i++ ) {
			var refTemplate = refcon.refTemplates[ i ];
			table.append('<tr id="templateheader'+i+'"><td class="refcon-templategroup" colspan="5" align="center">'
							+ refcon.getMessage( 'refstemplateno' ) + ' ' + ( i + 1 )
							+ (refcon.templateGroups[ i ].length > 0 ? ' (' + refcon.getMessage( 'referencegroup' ) + ': ' + refcon.templateGroups[ i ] + ')' : '')
							+ '</td></tr>');
			var j, k = 0;
			for ( j = 0; j < refTemplate.references.length; j++ ) {
				var reference = refTemplate.references[ j ];
				if ( reference ) {
					k++;
					var cssClass = k % 2 == 0 ? 'refcon-even' : 'refcon-odd';
					table.append(
					'<tr template="' + i + '">'
					+ '<td class="' + cssClass + '"><img src="' + refcon.getOption( 'image-yes' ) + '"></td>'
					+ '<td class="' + cssClass + '" align="center">' + k + '</td>'
					+ '<td class="' + cssClass + '"><input class="refcon-refname" type="text" template_id="' + i + '" name="' + j + '" value="' + reference.name + '"></td>'
					+ '<td class="' + cssClass + ' refcontent">' + reference.content + '</td>'
					+ '<td class="' + cssClass + '" align="center">' + reference.citations.length + '</td>'
					+ '<td class="' + cssClass + '"><input class="refcon-refplace" type="checkbox" name="' + j + '" value="' + reference.citations.length + '"' + ( reference.inRefTemplate === true ? 'checked' : '' ) + '></td>'
					+ '</tr>');
				}
			}
		}
		table.append('<tr><td colspan="5"><table id="refcon-table-options">\
					<tr><td><span class="refcon-option-header">' + refcon.getMessage( 'optionsheaderreflocation' ) + '</span></td><td width="20"></td><td><span class="refcon-option-header">' + refcon.getMessage( 'optionsheaderother' ) + '</span></td></tr>\
					<tr><td><span class="refcon-option-point"><input class="refcon-refplacement" type="radio" name="reference-place" value="template"> ' + refcon.getMessage( 'optionlocation1' ) + '</span></td><td width="20"></td><td><span class="refcon-option-point"><input type="checkbox" id="refcon-savesorted" name="sort" value="yes">'+ refcon.getMessage( 'checkboxsortorder' ) +'</span></td></tr>\
					<tr><td><span class="refcon-option-point"><input class="refcon-refplacement" type="radio" name="reference-place" value="text"> ' + refcon.getMessage( 'optionlocation2' ) + '</span></td><td width="20"></td><td><span class="refcon-option-point"><input type="checkbox" id="refcon-keepnames" name="names" value="yes">'+ refcon.getMessage( 'checkboxkeepnames' ) +'</span></td></tr>\
					<tr><td><span class="refcon-option-point"><input class="refcon-refplacement" type="radio" name="reference-place" value="usage"> ' + refcon.getMessage( 'optionlocation3', [ '<input id="refcon-table-options-uses" type="text" name="min_uses" size="2" value="2">' ]) + '</span></td><td width="20"></td><td></td></tr>\
					</table></td></tr>');
		table.append('<tr id="refcon-buttons"><td colspan="5" align="center"><button type="button" id="refcon-abort-button" class="refcon-abort">'
						+ refcon.getMessage( 'buttonabort' ) + '</button><button type="button" id="refcon-continue-button">'
						+ refcon.getMessage( 'buttoncontinue' ) + '</button></td></tr>');

		container.css( 'display', 'block' );

		// Bind events

		// Close window when user clicks on 'x'
		$( '.refcon-abort' ).on( 'click', function() {
			gui.remove();
			refcon.cleanUp();
		});

		// Activate 'Continue' button when user changes some reference name
		$( '#refcon-table .refcon-refname' ).on( 'input', function() {
			$( '#refcon-continue-button' ).removeAttr( 'disabled' );
		});

		// Validate reference names when user clicks 'Continue'. If there are errors, disable 'Continue' button
		$( '#refcon-continue-button' ).on( 'click', function( event ) {
			refcon.validateInput();
			if ( table.find('[data-invalid]').length === 0 ) {
				refcon.afterScreenSave();
			} else {
				$( '#refcon-continue-button' ).attr('disabled', true);
			}
		});

		// Sort table if user clicks on sortable table header
		$( ".refcon-sortable" ).on('click', function() {
			refcon.sortTable( $(this) );
		});

		$( "#refcon-table .refcon-refplacement" ).on( 'change', function() {
			switch( $( this ).val() ) {
				case 'template':
					$( '#refcon-table .refcon-refplace' ).prop('checked', true);
					break;
				case 'text':
					$( '#refcon-table .refcon-refplace' ).prop('checked', false);
					break;
				case 'usage':
					refcon.selectReferencesByUsage();
					break;
			}
		});
		// When user clicks on uses input field, select the third radio checkbox
		$( "#refcon-table-options-uses" ).on( 'focus', function() {
			$('#refcon-table-options input:radio[name=reference-place]:nth(2)').trigger( "click" );
		});

		$( "#refcon-table-options-uses" ).on( 'input', function() {
			refcon.selectReferencesByUsage();
		});

	},

	sortTable: function ( columnHeader ) {
		var order = $( columnHeader ).hasClass('refcon-asc') ? 'refcon-desc' : 'refcon-asc';
		$('.refcon-sortable').removeClass('refcon-asc').removeClass('refcon-desc');
		$( columnHeader ).addClass( order );

		var colIndex = $( columnHeader ).prevAll().length;
		var tbod = $( columnHeader ).closest("table").find("tbody");

		var i;
		for ( i = 0; i < refcon.templateGroups.length; i++ ) {
			var rows = $( tbod ).children("tr[template='" + i + "']");
			rows.sort( function( a,b ) {
				var A = $(a).children("td").eq(colIndex).has("input").length ? $(a).children("td").eq(colIndex).children("input").val() : $(a).children("td").eq(colIndex).text();
				var B = $(b).children("td").eq(colIndex).has("input").length ? $(b).children("td").eq(colIndex).children("input").val() : $(b).children("td").eq(colIndex).text();

				if ( colIndex === 1 || colIndex === 4 ) {
					A = Number(A);
					B = Number(B);
					return order === 'refcon-asc' ? A - B : B - A;
				} else {
					if ( order === 'refcon-asc' ) {
						return A.localeCompare( B, mw.config.get( 'wgContentLanguage' ) );
					} else {
						return B.localeCompare( A, mw.config.get( 'wgContentLanguage' ) );
					}
				}
			});
			$( rows ).each( function( index ) {
				$( this ).children("td").removeClass('refcon-even').removeClass('refcon-odd');
				$( this ).children("td").addClass( index % 2 == 0 ? 'refcon-odd' : 'refcon-even' );
			});

			$( columnHeader ).closest("table").find("tbody").children("tr[template='" + i + "']").remove();
			$( columnHeader ).closest("table").find("#templateheader"+i).after( rows );
		}

		// Activate 'Continue' button when user changes some reference name
		$( '#refcon-table .refcon-refname' ).on( 'input', function() {
			$( '#refcon-continue-button' ).removeAttr( 'disabled' );
		});
	},

	selectReferencesByUsage: function () {
		var usage = $( "#refcon-table-options-uses" ).val();
		if ( usage.length > 0 ) {
			var regex = /[^0-9]+/;
			if ( !usage.match( regex ) ) {
				usage = Number( usage );
				$( '#refcon-table .refcon-refplace' ).each(function() {
					if ( $(this).attr('value') >= usage )
						$(this).prop('checked', true);
					else
						$(this).prop('checked', false);
				});
			}
		}
	},

	validateInput: function () {
		var names = {}, duplicateNames = {}, i;

		for ( i = 0; i < refcon.templateGroups.length; i++ ) {
			names[ i ] = {};
			duplicateNames[ i ] = {};
		}

		$( '#refcon-table .refcon-refname' ).each(function() {
			if ( $(this).val() in names[ $(this).attr('template_id') ] ) {
				duplicateNames[ $(this).attr('template_id') ][ $(this).val() ] = 1;
			} else {
				names[ $(this).attr('template_id') ][ $(this).val() ] = 1;
			}
		});

		$( '#refcon-table .refcon-refname' ).each(function() {
			if ( $(this).val() in duplicateNames[ $(this).attr('template_id') ] ) {
				refcon.markFieldAsInvalid( $(this) );
			} else if ( $(this).val() === '' ) {
				refcon.markFieldAsInvalid( $(this) );
			} else if ( $(this).val().match(/[<>"]/) !== null ) {
				refcon.markFieldAsInvalid( $(this) );
			} else {
				refcon.markFieldAsValid( $(this) );
			}
		});
	},

	markFieldAsValid: function ( inputField ) {
		$( inputField ).removeAttr( 'data-invalid' );
		$( inputField ).closest( 'tr' ).find( 'img' ).attr( 'src', refcon.getOption( 'image-yes' ));
	},

	markFieldAsInvalid: function ( inputField ) {
		$( inputField ).attr( 'data-invalid', 1 );
		$( inputField ).closest( 'tr' ).find( 'img' ).attr( 'src', refcon.getOption( 'image-no' ));
	},

	/**
	 * Process form after the Save button was pressed
	 *
	 * @return {void}
	 */

	afterScreenSave: function () {
		$( '#refcon-table tr[template]' ).each(function() {
			var refName = $( this ).find( '.refcon-refname' );
			var name = refName.val();
			var templateId = refName.attr( 'template_id' );
			var refId = refName.attr( 'name' );
			// change reference names to the ones from the form, in case some name was changed
			refcon.refTemplates[ templateId ].references[ refId ].changeName( name );
			// save reference location preference from the form into reference object
			var refPlace = $( this ).find( '.refcon-refplace' );
			refcon.refTemplates[ templateId ].references[ refId ].inRefTemplate = refPlace.prop('checked') ? true : false;
		});

		// If user has checked "save sorted" checkbox, save sorting preferences
		if ( $('#refcon-savesorted').prop('checked') ) {
			var sortOptions = {};
			if ( $( '.refcon-asc' ).prevAll().length ) {
				sortOptions['column'] = $( '.refcon-asc' ).prevAll().length;
				sortOptions['order'] = 'asc';
			} else if ( $( '.refcon-desc' ).prevAll().length ) {
				sortOptions['column'] = $( '.refcon-desc' ).prevAll().length;
				sortOptions['order'] = 'desc';
			}
			refcon.userOptions['sort'] = sortOptions;
		}
		// If user has checked "keep names" checkbox, save name keeping preferences
		if ( $('#refcon-keepnames').prop('checked') )
			refcon.userOptions['keepnames'] = true;
		else
			refcon.userOptions['keepnames'] = false;

		refcon.commit();
	},

	/**
	 * Parse article text and find all reference templates indexes
	 *
	 * @return {array} Start indexes of all reference templates
	 */

	parseIndexes: function () {

		var refTemplateNames = refcon.getOption( 'reftemplatenames' );

		var wikitext = refcon.getTextbox().val(),
			i, name, re, refTemplateIndexes = [];

		// Make all appearances of the reference templates in article text uniform
		if ( Array.isArray( refTemplateNames ) ) {
			var refTemplateName = refTemplateNames[0];

			for ( i = 0; i < refTemplateNames.length; i++ ) {
				name = refTemplateNames[ i ];
				re = new RegExp( '{{\s*' + name, 'gi' );
				wikitext = wikitext.replace( re, '{{' + refTemplateName );
			}

			// Find all indexes of the reference template in the article and put them into array
			// Index is the place in article text where references template starts
			var pos = wikitext.indexOf( '{{' + refTemplateName );

			if (pos !== -1)
				refTemplateIndexes.push( pos );

			while (pos !== -1) {
				pos = wikitext.indexOf( '{{' + refTemplateName, pos + 1 );
				if (pos !== -1)
					refTemplateIndexes.push( pos );
			}
		} else {
			// call some error handling function and halt
		}

		// Set the refcon variable with modified wikitext
		refcon.textBoxText = wikitext;

		return ( refTemplateIndexes );

	},

	/**
	 * Get reference template's content and end index
	 *
	 * @param {integer} reference template's index in article text
	 * @param {integer} next reference template's index in article text
	 *
	 * @return {object} reference template's content string, start and end indexes
	 */

	 getTemplateContent: function (templateIndex, nextTemplateIndex) {

		var	textPart = refcon.textBoxText.substring(templateIndex, nextTemplateIndex);
		var i, depth = 1, prevChar = '', templateEndIndex = 0, templateAbsEndIndex = null, templateContent = '';

		// Go through the textPart and find the template's end code '}}'
		// @todo: could use ProveIt's alternative code here
		for ( i = 2; i < nextTemplateIndex; i++ ) {
			if (textPart.charAt(i) === "{" && prevChar === "{")
				++depth;
			if (textPart.charAt(i) === "}" && prevChar === "}")
				--depth;
			if (depth === 0) {
				templateEndIndex = i + 1;
				break;
			}
			prevChar = textPart.charAt(i);
		}

		// If templateEndIndex is 0, reference template's ending '}}' is missing in the textPart

		if ( templateEndIndex > 0 ) {
			templateContent = textPart.substring(0, templateEndIndex);
			templateAbsEndIndex = templateIndex + templateEndIndex;
		}

		return ({
			'templateContent': templateContent,
			'refStartIndex' : templateIndex,
			'refEndIndex': templateAbsEndIndex
		});

	},

	/**
	 * Get all reference templates' name and value pairs using a single mw.Api call
	 *
	 * @param {string} String that contains all article's reflist templates
	 *
	 * @return {array} List of reference template objects with parameter names and values
	 */

	 getTemplateParams: function ( templatesString ) {

		var paramPairsList = [];
		var refTemplateNames = refcon.getOption( 'reftemplatenames' );

		if ( Array.isArray( refTemplateNames ) ) {
			var mainRefTemplateName = refTemplateNames[0];
		} else {
			// call some error handling function and halt
		}

		// We will do a single API call to get all reflist templates parameter pairs
		new mw.Api().post({
			'action': 'expandtemplates',
			'text': templatesString,
			'prop': 'parsetree'
		}, { async: false }).done( function ( data ) {
			var parsetree = data.expandtemplates.parsetree;
			var result = xmlToJSON.parseString( parsetree );
			var i, templateRoot = result.root[0].template;

			//@todo: could rewrite the code to use JSON.parse
			for ( i = 0; i < templateRoot.length; i++ ) {
				if ( templateRoot[ i ].title[0]['_text'] === mainRefTemplateName ) {
					var paramPairs = {};
					var part = templateRoot[ i ].part;
					if ( typeof part !== 'undefined' ) {
						var j, name, value, ext;
						for ( j = 0; j < part.length; j++ ) {
							if ( typeof part[ j ].equals !== 'undefined' ) {
								name = part[ j ].name[0]['_text'];
							} else {
								name = part[ j ].name[0]['_attr']['index']['_value'];
							}
							name = typeof name === 'string' ? name.trim() : name;
							// By checking 'ext' first, '_text' second,
							// if the parameter value is a list of references that contains some text between the reference tags, the text is lost.
							// But at least we get the references and not the text instead
							if ( typeof part[ j ].value[0]['ext'] !== 'undefined' ) {
								ext = part[ j ].value[0]['ext'];
								if ( Array.isArray( ext ) ) {
									var k, attr, inner;
									value = [];
									for ( k = 0; k < ext.length; k++ ) {
										if ( typeof ext[ k ]['name'][0]['_text'] !== 'undefined' && ext[ k ]['name'][0]['_text'].toLowerCase() === 'ref'
											&& typeof ext[ k ]['close'][0]['_text'] !== 'undefined' && ext[ k ]['close'][0]['_text'].toLowerCase() === '</ref>' ) {
											if ( typeof ext[ k ]['attr'][0]['_text'] !== 'undefined' && typeof ext[ k ]['inner'][0]['_text'] !== 'undefined' ) {
												value.push({
													'attr': ext[ k ]['attr'][0]['_text'],
													'inner': ext[ k ]['inner'][0]['_text']
												});
											}
										}
									}
								}
							} else if ( typeof part[ j ].value[0]['_text'] !== 'undefined' ) {
								value = part[ j ].value[0]['_text'];
							}
							value = typeof value === 'string' ? value.trim() : value;
							paramPairs[ name ] = value;
						}
						paramPairsList.push( paramPairs );
					}
				}
			}
		});
		return ( paramPairsList );
	 },

	/**
	 * Get reference template object from paramPairs and templateData objects
	 *
	 * @param {object} reference template data object with indexes and template content
	 * @param {object} reference template parameter pairs object with param names and values
	 *
	 * @return {object} reference template object
	 */

	 getTemplateObject: function ( templateData, paramPairs ) {

		var name, i, groupName;
		var refGroupNames = refcon.getOption( 'reftemplategroupnames' );

		// Go through paramPairs and see if there is a configuration defined group name in parameter names. Get it's value
		if ( Array.isArray( refGroupNames ) ) {
			if ( typeof paramPairs === 'object' ) {
				for ( i = 0; i < refGroupNames.length; i++ ) {
					var name = refGroupNames[ i ];
					if ( typeof paramPairs[ name ] !== 'undefined' ) {
						groupName = paramPairs[ name ];
						break;
					}
				}
			}
		} else {
			// call some error handling function and halt
		}

		if ( typeof groupName === 'undefined' ) {
			groupName = '';
		}

		refcon.templateGroups.push( groupName );

		// Build basic reference template
		var refTemplate = new refcon.RefTemplate({
			'group': groupName,
			'string': templateData[ 'templateContent' ],
			'start': templateData[ 'refStartIndex' ],
			'end': templateData[ 'refEndIndex' ],
			'params': paramPairs
		});

		return ( refTemplate );
	},

	/**
	 * Parse references in reference template's refs field (using mw.Api)
	 *
	 * @param {object} refTemplate object
	 *
 	 * @return {void} 
	 */

	 parseTemplateRefs: function ( refTemplate ) {
		 
		var refsNames = refcon.getOption( 'reftemplaterefsnames' );
		var refsArray, refsName, i;

		if ( Array.isArray( refsNames ) ) {
			if ( typeof refTemplate.params === 'object' ) {
				for ( i = 0; i < refsNames.length; i++ ) {
					refsName = refsNames[ i ];
					if ( typeof refTemplate.params[ refsName ] !== 'undefined' ) {
						refsArray = refTemplate.params[ refsName ];
						break;
					}
				}
			}
		} else {
			// call some error handling function and halt
		}

		// Look for references inside the reference template's refs parameter

		if ( typeof refsArray !== 'undefined' && refsArray.length > 0) {
			for ( i = 0; i < refsArray.length; i++ ) {

				// Turn all matches into reference objects
				reference = refcon.parseReference( [ '', refsArray[i].attr, refsArray[i].inner ], 'reference' );

				// Only add references that have name
				if ( reference['name'].length > 0 ) {
					refTemplate.addRef( reference );
				}
			}
		}
		refcon.refTemplates.push( refTemplate );
	},

	/**
	 * Make a reference object out of a reference string
	 *
	 * @param {array} match array produced by regexp
	 * @param {string} type. can be either "reference" or "citation"
	 *
	 * @return {object} returns either reference object or citation object based on type
	 */

	parseReference: function ( data, type ) {
		var params = {}, referenceName, referenceGroup,
			referenceString = data[0], refParamString = data[1],
			referenceContent = data[2], referenceIndex = data.index;

		if (typeof refParamString !== 'undefined') {
			refParamString = refParamString.trim();

			if (refParamString.length > 0) {
				//Examples of strings to extract name and group from
				//group="arvuti" name="refname1"
				//name="refname2" group="arvuti str"
				//group="arvuti"
				//name="refname1 blah"

				var re = /(?:(name|group)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^ ]+)))(?:\s+(name|group)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^ ]+)))?/i;

				var match = refParamString.match(re);

				try {
					if ( typeof match[1] !== 'undefined' && ( typeof match[2] !== 'undefined' || typeof match[3] !== 'undefined' || typeof match[4] !== 'undefined' ) ) {
						if ( typeof match[2] !== 'undefined' ) {
							params[ match[1] ] = match[2];
						} else if ( typeof match[3] !== 'undefined' ) {
							params[ match[1] ] = match[3];
						} else {
							params[ match[1] ] = match[4];
						}
					}

					if ( typeof match[5] !== 'undefined' && ( typeof match[6] !== 'undefined' || typeof match[7] !== 'undefined' || typeof match[8] !== 'undefined' ) ) {
						if ( typeof match[6] !== 'undefined' ) {
							params[ match[5] ] = match[6];
						} else if ( typeof match[7] !== 'undefined' ) {
							params[ match[5] ] = match[7];
						} else {
							params[ match[5] ] = match[8];
						}
					}
				} catch ( e ) {
					refcon.throwReferenceError( referenceString, refcon.getMessage( 'parsereferror', [ referenceString ] ), e );
				}

				referenceName = params['name'] ? params['name'] : '';
				referenceGroup = params['group'] ? params['group'] : '';
			}
		}

		if ( typeof referenceGroup === 'undefined' )
			referenceGroup = '';

		if ( typeof referenceName === 'undefined' )
			referenceName = '';

		var found = referenceName.match(/[<>"]/);
		if ( found !== null ) {
			refcon.throwReferenceError( referenceString, refcon.getMessage( 'parserefforbidden', [ found[0], referenceString ] ));
		}

		// Clean reference name and content of newlines, double spaces, leading or trailing whitespace and more

		referenceName = refcon.cleanString( referenceName, 'name' );

		if ( typeof referenceContent !== 'undefined' )
			referenceContent = refcon.cleanString( referenceContent, 'content' );

		if ( type === 'reference' ) {
			// Build the basic reference
			var reference = new refcon.Reference({
				'group': referenceGroup,
				'name': referenceName,
				'content': referenceContent,
				'index': referenceIndex,
				'string': referenceString
			});
		} else if ( type === 'citation' ) {
			// Build the basic citation
			var reference = new refcon.Citation({
				'group': referenceGroup,
				'name': referenceName,
				'index': referenceIndex,
				'string': referenceString
			});
		}
		return reference;
	},

	throwReferenceError: function ( referenceString, message, error ) {
		var found = refcon.getTextbox().val().match( refcon.escapeRegExp( referenceString ) );
		refcon.highlight( found.index, referenceString );
		window.alert( message );
		refcon.cleanUp();
		throw new Error( error );
	},

	/**
	 * Clean reference name and content of newlines, double spaces, leading or trailing whitespace, etc
	 *
	 * @param {string} reference name or reference content string
	 * @param (string) whether the string is name or content
	 *
	 * @return {string} cleaned reference name and content
	 */

	cleanString: function ( str, type ) {

		// get rid of newlines and trailing/leading space
		str = str.replace(/(\r\n|\n|\r)/gm,' ').trim();

		// get rid of double whitespace inside string
		str = str.replace(/\s\s+/g, ' ');

		// if the str is content, get rid of extra space before template closing / after template opening
		if ( type === 'content') {
			str = str.replace(/ }}/g, '}}');
			str = str.replace(/{{ /g, '{{');
		}

		return (str);
	},

	escapeRegExp: function ( str ) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	},

	/**
	 * Highlight string in the textbox and scroll it to view
	 *
	 * @return {void}
	 */
	highlight: function ( index, string ) {
		var textbox = refcon.getTextbox()[0],
			text = textbox.value;

		// Scroll to the string
		textbox.value = text.substring( 0, index );
		textbox.focus();
		textbox.scrollTop = 99999999; // Larger than any real textarea (hopefully)
		var currentScrollTop = textbox.scrollTop;
		textbox.value += text.substring( index );
		if ( currentScrollTop > 0 ) {
			textbox.scrollTop = currentScrollTop + 300;
		}

		// Highlight the string
		var start = index,
			end = start + string.length;
		$( textbox ).focus().textSelection( 'setSelection', { 'start': start, 'end': end } );
	},

	/**
	 * Turn all article text parts – parts that are between reference templates – into objects and save into array
	 *
	 * @return {void}
	 */

	storeTextParts: function () {
		var i, text, refEnd, from, to, textPart;

		for ( i = 0; i < refcon.refTemplates.length; i++ ) {

			from = refEnd ? refEnd : 0;

			to = refcon.refTemplates[ i ]['start'];
			refEnd = refcon.refTemplates[ i ]['end'];

			if ( to === 0 ) {
				continue;
			}

			text = refcon.textBoxText.substring( from, to );

			// Textpart's references can only be in templates that come after the textpart in article text
			var j, groupName, groupNames = {};

			for ( j = i; j < refcon.refTemplates.length; j++ ) {
				groupName = refcon.templateGroups[ j ];
				// Only add the first instance of template group
				if ( typeof groupNames[ groupName ] === 'undefined' ) {
					groupNames[ groupName ] = j;
				}
			}

			// @todo: check what happens if a reference template follows another reference template without any space.
			// Does textpart still get correct inTemplate sequence?

			// Create new TextPart object and store it

			textPart = new refcon.TextPart({
				'start': from,
				'end': to,
				'string': text,
				'inTemplates': groupNames
			});

			refcon.textParts.push( textPart );
		}

		// Add the last text part after the last reference template
		if ( typeof refEnd === 'number' && refEnd > 0 ) {
			if ( refcon.textBoxText.length > refEnd ) {

				text = refcon.textBoxText.substring( refEnd, refcon.textBoxText.length );

				textPart = new refcon.TextPart({
					'start': refEnd,
					'end': refcon.textBoxText.length,
					'string': text
				});

				refcon.textParts.push( textPart );
			}
		}
	},

	/**
	 * Find all references and citations in a TextPart object and store them in the object.
	 *
	 * @param {object} TextPart object
	 */

	parseTextParts: function ( textPart ) {

		if ( typeof textPart.string !== 'undefined' && textPart.string.length > 0 ) {

			// Look for all citations
			// Citations come in two forms:
			// 1. <ref name="CV Kontrollikoda"/>
			// 2. <ref name="pm"></ref>
			// Ref label can have optional group parameter:
			// <ref group="blah" name="CV Kontrollikoda"/> or <ref name="CV Kontrollikoda" group="blah"/>
			// Group and name parameter values can be between '' or "", or bare (if value has no whitespaces)

			var citations = [],
				citationsRegExp = /<ref(\s+[^/>]+)(?:\/\s*>|><\/ref>)/ig,
				match,
				citation;

			while ( ( match = citationsRegExp.exec( textPart.string ) ) ) {

				// Turn all the matches into citation objects
				citation = refcon.parseReference( match, 'citation' );

				if ( typeof citation === 'object' && typeof citation.name !== 'undefined' ) {
					citations.push( citation );
				}
			}

			textPart.citations = citations;

			// Look for all references

			var references = [],
				referencesRegExp = /<ref(\s+[^\/]+?)?>([\s\S]*?)<\/ref>/ig,
				match,
				reference;

			while ( ( match = referencesRegExp.exec( textPart.string ) ) ) {
				// Avoid further processing of citations like <ref name="pm"></ref>
				if ( match[2] === '' ) {
					continue;
				}

				// Turn all the matches into reference objects
				reference = refcon.parseReference( match, 'reference' );

				references.push( reference );
			}

			textPart.references = references;
		}
	},

	/**
	 * Compare references in a TextPart object to the references in reference template (if there are any). Add references into
	 * reference template. Update indexes. For each reference create citation object and link it with reflist template reference.
	 *
	 * @param {object} TextPart object
	 */
	processTextPartRefs: function ( textPart ) {
		var i, reference, refTemplate, templateRef,
			createdCitations = [];

		for ( i = 0; i < textPart.references.length; i++ ) {
			reference = textPart.references[ i ];

			refTemplate = refcon.refTemplates[ textPart.inTemplates[ reference.group ] ];

			// First add named references, because otherwise we could create new records (and names) 
			// for already existing text part defined references
			if ( reference.content.length > 0 && reference.name.length > 0 ) {

				// First check if this a complete duplicate reference (name and value are the same)
				templateRef = refcon.getRefByIndex( refTemplate, 'keyValues', reference.name + '_' + reference.content );

				if ( typeof templateRef === 'object' ) {
					if ( templateRef.name === reference.name && templateRef.content === reference.content ) {
						// found exact duplicate
						var citation = new refcon.Citation({
							'group': reference.group,
							'name': reference.name,
							'index': reference.index,
							'string': reference.string
						});
						templateRef.citations.push( citation );
						createdCitations.push( citation );
						continue;
					}
				}
				// Check if the reference has the same name but different content than template reference
				templateRef = refcon.getRefByIndex( refTemplate, 'keys', reference.name );

				if ( typeof templateRef === 'object' ) {
					if ( templateRef.name === reference.name && templateRef.content !== reference.content ) {
						// found reference with the same name but different content

						// add reference content to template references under new name
						var newName = refTemplate.getNewName( reference.name );
						var newRef = new refcon.Reference({
							'group': reference.group,
							'name': newName,
							'content': reference.content,
							'inRefTemplate': false
						});
						var citation = new refcon.Citation({
							'group': reference.group,
							'name': newName,
							'index': reference.index,
							'string': reference.string
						});
						newRef.citations.push( citation );
						refTemplate.addRef( newRef );
						createdCitations.push( citation );
						// add names into replacements object, so we can replace all citation names that use the old name
						refTemplate.replacements[ reference.name ] = newName;
						continue;
					}
				}
				// Check if the reference has the same content but different name than template reference
				templateRef = refcon.getRefByIndex( refTemplate, 'values', reference.content );

				if ( typeof templateRef === 'object' ) {
					if ( templateRef.content === reference.content && templateRef.name !== reference.name ) {
						// Found reference with the same content but different name.
						// Drop reference name, use reflist template reference name as citation name
						var citation = new refcon.Citation({
							'group': reference.group,
							'name': templateRef.name,
							'index': reference.index,
							'string': reference.string
						});
						templateRef.citations.push( citation );
						createdCitations.push( citation );
						// add names into replacements object, so we can replace all citation names that use the old name
						refTemplate.replacements[ reference.name ] = templateRef.name;
						continue;
					}
				}
				// If we get here, it means we've got a named reference that has not yet been described in reflist template.
				// Add the reference to reflist references
				var newRef = new refcon.Reference({
					'group': reference.group,
					'name': reference.name,
					'content': reference.content,
					'inRefTemplate': false
				});
				var citation = new refcon.Citation({
					'group': reference.group,
					'name': reference.name,
					'index': reference.index,
					'string': reference.string
				});
				newRef.citations.push( citation );
				refTemplate.addRef( newRef );
				createdCitations.push( citation );
			}
		}
		// Now we go through unnamed references
		for ( i = 0; i < textPart.references.length; i++ ) {
			reference = textPart.references[ i ];

			refTemplate = refcon.refTemplates[ textPart.inTemplates[ reference.group ] ];

			if ( reference.content.length > 0 && reference.name.length === 0 ) {
				templateRef = refcon.getRefByIndex( refTemplate, 'values', reference.content );
				if ( typeof templateRef === 'object' ) {
					if ( templateRef.content === reference.content ) {
						// found reference with the same content
						var citation = new refcon.Citation({
							'group': reference.group,
							'name': templateRef.name,
							'index': reference.index,
							'string': reference.string
						});
						templateRef.citations.push( citation );
						createdCitations.push( citation );
						continue;
					}
				}
				// If we get here, we have a completely new unnamed reference
				// add the reference to template references
				var newName = refTemplate.getNewName();
				var newRef = new refcon.Reference({
					'group': reference.group,
					'name': newName,
					'content': reference.content,
					'inRefTemplate': false
				});
				var citation = new refcon.Citation({
					'group': reference.group,
					'name': newName,
					'index': reference.index,
					'string': reference.string
				});
				newRef.citations.push( citation );
				refTemplate.addRef( newRef );
				createdCitations.push( citation );
			}
		}
		textPart.linkedCitations = createdCitations;
	},

	/**
	 * Link citations to their reflist template references
	 *
	 * @param {object} TextPart object
	 *
	 * @return {void}
	 */
	linkCitations: function ( textPart ) {

		var citation, refTemplate, replaceName, templateRef,
			i;

		for ( i = 0; i < textPart.citations.length; i++ ) {
			citation = textPart.citations[ i ];

			refTemplate = refcon.refTemplates[ textPart.inTemplates[ citation.group ] ];

			if ( citation.name.length > 0 ) {

				// If there is replacement name in replacements object, replace the citation name
				replaceName = refTemplate.replacements[ citation.name ];

				if ( typeof replaceName !== 'undefined' ) {
					citation.name = replaceName;
				}

				// For each citation try to find its reference
				templateRef = refcon.getRefByIndex( refTemplate, 'keys', citation.name );
				if ( typeof templateRef === 'object' ) {
					if ( templateRef.name === citation.name ) {
						templateRef.citations.push( citation );
						textPart.linkedCitations.push( citation );
					}
				}
			}
		}
	},

	/**
	 * Replace all references in TextPart object string with citations. Also replace citation names that were changed in previous steps
	 *
	 * @param {object} TextPart object
	 *
	 * @return {void}
	 */
	replaceTextPartRefs: function ( textPart ) {
		var i, citation, refTemplate, templateRef;
		for ( i = 0; i < textPart.linkedCitations.length; i++ ) {
			citation = textPart.linkedCitations[ i ];
			if ( citation.name.length > 0 ) {
				refTemplate = refcon.refTemplates[ textPart.inTemplates[ citation.group ] ];
				templateRef = refcon.getRefByIndex( refTemplate, 'keys', citation.name );

				// For the references that are marked as "in reference list template" replace all instances with citation
				if ( templateRef.inRefTemplate === true ) {
					textPart.string = textPart.string.replace( citation.string, citation.toString() );
				// For the references that are marked as "in article text"...
				} else {
					// if the reference has just one use, output the reference string w/o name (unless user options "keep names" was selected)
					if ( templateRef.citations.length == 1 ) {
						textPart.string = textPart.string.replace( citation.string, templateRef.toStringText( refcon.userOptions.keepnames ) );
					// if the reference has more uses...
					} else {
						// if the reference has not been output yet, output named reference
						if ( templateRef.wasPrinted === false ) {
							textPart.string = textPart.string.replace( citation.string, templateRef.toStringText( true ) );
							// mark reference as printed
							templateRef.wasPrinted = true;
						// if the reference has already been printed, output citation
						} else {
							textPart.string = textPart.string.replace( citation.string, citation.toString() );
						}
					}
				}
			}
		}
	},

	/**
	 * Build reference templates
	 *
	 * @param {object} RefTemplate object
	 *
	 * @return {void}
	 */
	buildRefTemplates: function ( refTemplate ) {
		var i, reference, referencesString = '', refsAdded = false;

		// sort references if user has checked the checkbox
		if ( typeof refcon.userOptions.sort === 'object' && Object.keys( refcon.userOptions.sort ).length > 0 ) {
			refcon.sortReferences ( refTemplate );
		}

		// turn reference data into reflist parameter value string
		for ( i = 0; i < refTemplate.references.length; i++ ) {
			reference = refTemplate.references[ i ];
			if ( typeof reference === 'object' && reference.inRefTemplate === true ) {
				referencesString += reference.toString() + "\n";
			}
		}
		// Cut the last newline
		referencesString = referencesString.substr( 0, referencesString.length - 1 );

		var refTemplateNames = refcon.getOption( 'reftemplatenames' );

		if ( Array.isArray( refTemplateNames ) ) {
			var refTemplateName = refTemplateNames[0];
		} else {
			// call some error handling function and halt
		}

		var refsNames = refcon.getOption( 'reftemplaterefsnames' );

		if ( Array.isArray( refsNames ) ) {
			var refsName = refsNames[0];
		} else {
			// call some error handling function and halt
		}

		var templateString = '{{' + refTemplateName;

		// Build references template string
		if ( Object.keys( refTemplate.params ).length > 0 ) {
			// Go through params object
			for ( var name in refTemplate.params ) {
				var value = refTemplate.params[ name ];
				// If param name matches with config name for reference list template refs param...
				if ( refsNames.indexOf( name ) > -1 ) {
					// ... only if there are references in reflist template
					if ( referencesString.length > 0 ) {
						// ... add refstring to reflist params
						templateString += '|' + refsName + '=' + "\n" + referencesString;
						refsAdded = true;
					}
					continue;
				} else if ( typeof value !== 'string' && typeof value !== 'number' ) {
					// If value is anything other than string or number, skip it. 
					// Value is array if, for example, references are incorrectly defined inside unnamed parameter.
					continue;
				}
				templateString += '|' + name + '=' + value;
			}
		}
		// if the reflist template was without any parameters, add parameter and references here
		if ( refsAdded === false && referencesString.length > 0 ) {
			templateString += '|' + refsName + "=\n" + referencesString;
		}
		if ( referencesString.length > 0 )
			templateString += "\n}}";
		else
			templateString += "}}";

		refTemplate.string = templateString;
	},

	/**
	 * Sort references inside reflist template according to user preferences
	 *
	 * @param {object} Reftemplate object
	 *
	 * @return {void}
	 */
	sortReferences: function ( refTemplate ) {

		if ( refcon.userOptions.sort.column === 1 ) {
			refTemplate.references = refcon.userOptions.sort.order === 'desc' ? refTemplate.references.reverse() : refTemplate.references;
		} else {
			refTemplate.references.sort( function( a,b ) {
				// order by reference name
				if ( refcon.userOptions.sort.column === 2 ) {
					return refcon.userOptions.sort.order === 'asc' ? a.name.localeCompare( b.name, mw.config.get( 'wgContentLanguage' ) ) : b.name.localeCompare( a.name, mw.config.get( 'wgContentLanguage' ) );
				// order by reference content
				} else if ( refcon.userOptions.sort.column === 3 ) {
					return refcon.userOptions.sort.order === 'asc' ? a.content.localeCompare( b.content, mw.config.get( 'wgContentLanguage' ) ) : b.content.localeCompare( a.content, mw.config.get( 'wgContentLanguage' ) );
				// order by citations count
				} else if ( refcon.userOptions.sort.column === 4 ) {
					return refcon.userOptions.sort.order === 'asc' ? a.citations.length - b.citations.length : b.citations.length - a.citations.length;
				}
			});
		}
	},

	/**
	 * Verify if configuration option should be used. Return true or false
	 * @param {string} Refcon option as returned by refcon.getOption method

	 * @param {string} User configuration variable content
	 *
	 * @return {boolean} True of false
	 */
	useConfigOption: function ( configOptionValue, userConfigOptionName ) {
		var result = false;
		switch ( configOptionValue ) {
		  case 'yes':
			result = true;
			break;
		  case 'no':
			result = false;
			break;
		  case 'user':
			if ( typeof refConsolidateConfig === 'object' && typeof refConsolidateConfig[ userConfigOptionName ] !== 'undefined' && refConsolidateConfig[ userConfigOptionName ] === true ) {
				result = true;
			}
			break;
		  default:
			result = false;
		}
		return ( result );
	},

	/**
	 * Write text parts and reference templates into textbox variable
	 *
	 * @return {string} String that contains article text
	 */

	writeTextBoxText: function () {

		var textBoxString = '';

		for ( i = 0; i < refcon.textParts.length; i++ ) {
			textPart = refcon.textParts[ i ];

			textBoxString += textPart.string;

			if ( typeof refcon.refTemplates[ i ] === 'object' ) {
				textBoxString += refcon.refTemplates[ i ].string;
			}
		}

		return ( textBoxString );
	},

	/**
	 * Index into reference template template objects and return template object
	 *
	 * @param {object} reference template object
	 * @param {string} index name
	 * @param {integer} key to index into
	 *
	 * @return {object} reference template object 
	 */
	 
	getRefByIndex: function ( refTemplate, dictname, key ) {
		var templateRef;
		var refDict = refTemplate[ dictname ];

		if ( key in refDict && Array.isArray( refDict[ key ] ) ) {
			var refKey = refDict[ key ][0];
			var templateRef = refTemplate.getRef( refKey );
		}

		return ( templateRef );
	},

	/**
	 * Add the RefCon edit summary
	 *
	 * @return {void}
	 */
	addSummary: function () {
		var currentSummary = $( '#wpSummary' ).val();
		var	refconSummary = refcon.getOption( 'summary' );
		var summarySeparator = refcon.getOption( 'summaryseparator' );

		if ( !refconSummary ) {
			return; // No summary defined
		}
		if ( currentSummary.indexOf( refconSummary ) > -1 ) {
			return; // Don't add it twice
		}
		$( '#wpSummary' ).val( currentSummary ? currentSummary + summarySeparator + refconSummary : refconSummary );
	},

	/**
	 * Set minor edit checkbox and click View Differences button
	 *
	 * @return {void}
	 */
	showDifferenceView: function () {
		document.forms.editform.wpMinoredit.checked = true;
		document.forms.editform.wpDiff.click();
	},

	/**
	 * Produces random string with a given length
	 *
	 * @param {integer} string length
	 * @param {string} charset (optional)
	 *
	 * @return {string} random string
	 */

	randomString: function ( len, charSet ) {
		charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var randomString = '';
		for ( var i = 0; i < len; i++ ) {
			var randomPoz = Math.floor( Math.random() * charSet.length );
			randomString += charSet.substring( randomPoz, randomPoz+1 );
		}
		return randomString;
	},

	/**
	 * Empty refcon arrays before script exit
	 *
	 * @return {void}
	 */
	cleanUp: function () {
		refcon.refTemplates = [];
		refcon.templateGroups = [];
		refcon.textParts = [];
		refcon.textBoxText = [];
	},

	/**
	 * TextPart class
	 *
	 * @param {object} data for constructing the object
	 */
	TextPart: function ( data ) {

		/**
		 * Article text start index
		 */
		this.start =  typeof data.start === 'number' ? data.start : null;

		/**
		 * Article text end index
		 */
		this.end = typeof data.end === 'number' ? data.end : null;

		/**
		 * Article text content string
		 */
		this.string = data.string ? data.string : '';

		/**
		 * Array that has indexes of reference templates that apply to this text part
		 */
		this.inTemplates = data.inTemplates ? data.inTemplates : {};

		/**
		 * Temporary holding array for reference objects
		 */
		this.references = [];

		/**
		 * Temporary holding array for citation objects
		 */
		this.citations = [];

		/**
		 * Array that hold citation objects that are linked to reflist template references
		 */
		this.linkedCitations = [];
	},


	/**
	 * Citation class
	 *
	 * @param {object} data for constructing the object
	 */

	Citation: function (data) {

		/**
		 * Citation group
		 */
		this.group = data.group ? data.group : '';

		/**
		 * Citation name
		 */
		this.name = data.name ? data.name : '';

		/**
		 * Citation location in the edit textbox
		 */
		this.index = data.index ? data.index : 0;

		/**
		 * Citation wikitext
		 *
		 * Example: <ref name="abc" />
		 */
		this.string = data.string ? data.string : '';

		/**
		 * Convert this citation to wikitext
		 */
		this.toString = function () {
			var useTemplateR = false;
			// check if we should use template {{R}} for shorter citation format
			useTemplateR = refcon.useConfigOption( refcon.getOption( 'usetemplateR' ), 'usetemplateR' );

			var startString = useTemplateR ? '{{r' : '<ref';
			var groupString = useTemplateR ? '|g=' + this.group : ' group="' + this.group + '"';
			var nameString = useTemplateR ? '|' + this.name : ' name="' + this.name + '"';
			var endString = useTemplateR ? '}}' : ' />';

			return ( startString + ( this.group ? groupString : '' ) + ( this.name ? nameString : '' ) + endString );
		};
	},

	/**
	 * Reference class
	 *
	 * @param {object} Data for constructing the object
	 */
	Reference: function ( data ) {

		/**
		 * Extend the Citation class
		 */
		refcon.Citation.call( this, data );

		/**
		 * Reference content (without the <ref> tags)
		 *
		 * Example: Second chapter of {{Cite book |first=Charles |last=Darwin |title=On the Origin of Species}}
		 */
		this.content = data.content ? data.content : '';

		/**
		 * Array that contains citations to this reference
		 */
		this.citations = [];

		/**
		 * Boolean for reference location. True (the default) means in reference list template. False means in article text
		 */
		this.inRefTemplate = typeof data.inRefTemplate !== 'undefined' ? data.inRefTemplate : true;

		/**
		 * Boolean for reference output. False (the default) means the reference has not been printed yet. True means it has been printed.
		 */
		this.wasPrinted = false;

		/**
		 * Convert this reference to wikitext (inside reference list template)
		 */
		this.toString = function () {
			var string = '<ref name="' + this.name + '">' + this.content + '</ref>';
			return string;
		};

		/**
		 * Convert this reference to wikitext (in article text)
		 */
		this.toStringText = function ( named ) {
			var string = '<ref';
			if ( this.group )
				string += ' group="' + this.group + '"';
			if ( named )
				string += ' name="' + this.name + '"';
			string += '>' + this.content + '</ref>';

			return string;
		};

		/**
		 * Change reference's name and it's citations' names
		 */
		this.changeName = function ( newName ) {
			this.name = newName;
			var i;
			for ( i = 0; i < this.citations.length; i++ ) {
				this.citations[ i ].name = newName;
			}
		};
	},

	/**
	 * Reftemplate class
	 *
	 * @param {object} Data for constructing the object
	 */
	RefTemplate: function ( data ) {

		/**
		 * Template group
		 */
		this.group = data.group ? data.group : '';

		/**
		 * Template wikitext
		 *
		 */
		this.string = data.string ? data.string : '';

		/**
		 * Template start position in the edit textbox
		 */
		this.start = data.start ? data.start : 0;

		/**
		 * Template end position in the edit textbox
		 */
		this.end = data.end ? data.end : 0;

		/**
		 * Template parameters object that holds name-value pairs
		 */
		this.params = data.params ? data.params : {};

		/**
		 * Array of reference objects of this template
		 */
		this.references = [];

		/**
		 * Reference index dicts
		 */

		this.keys = {};
		this.values = {};
		this.keyValues = {};

		/**
		 * Helper dicts to keep track of duplicate reference keys, values key/values
		 */

		this.dupKeys = {};
		this.dupValues = {};
		this.dupKeyValues = {};

		/**
		 * Dict that holds citation name replacements
		 */

		this.replacements = {};

		/**
		 * Populate reference template's index dicts
		 * @param {string} reference name
		 * @param (string) reference content
		 * @param (integer) reference order number in template
		 *
		 * @return {void}
		 */
		this.createIndexes = function ( key, value, ix ) {

			if (key in this.keys) {
				this.keys[key].push(ix);
				this.dupKeys[key] = this.keys[key];
			} else {
				this.keys[key] = [ix];
			}

			if (value in this.values) {
				this.values[value].push(ix);
				this.dupValues[value] = this.values[value];
			} else {
				this.values[value] = [ix];
			}

			if (key + '_' + value in this.keyValues) {
				this.keyValues[key + '_' + value].push(ix);
				this.dupKeyValues[key + '_' + value] = this.keyValues[key + '_' + value];
			} else {
				this.keyValues[key + '_' + value] = [ix];
			}
		};

		/**
		 * Recreate reference list template indexes
		 *
		 * @return {void}
		 */
		this.reIndex = function () {
			var i, reference;
			this.keys = {};
			this.values = {};
			this.keyValues = {};

			for ( i = 0; i < this.references.length; i++ ) {
				reference = this.references[ i ];
				if ( typeof reference === 'object' ) {
					this.keys[ reference.name ] = [ i ];
					this.values[ reference.content ] = [ i ];
					this.keyValues[ reference.name + '_' + reference.content ] = [ i ];
				}
			}
		};

		/**
		 * Process references indexes, remove duplicate 
		 *
		 * @return {void}
		 */

		this.processDuplicates = function () {
			this.processIndex( this.dupKeyValues, this.processDupKeyValues, this );
			this.processIndex( this.dupKeys, this.processDupKeys, this );
			this.processIndex( this.dupValues, this.processDupValues, this );
		};

		this.processIndex = function ( indexObj, callBack, callbackObj ) {
			// returnObj and dataObj are a bit of a hack for dupValues index. We need to get back the refIndex of the first duplicate value
			// to add it into the replacements array with the duplicate values that were deleted
			var returnObj, dataObj;
			for (var key in indexObj) {
				if (indexObj.hasOwnProperty(key)) {
					indexObj[key].forEach(function ( refIndex, ix ) {
						returnObj = callBack.call( callbackObj, refIndex, ix, dataObj );
						if ( typeof returnObj === 'object' ) {
							dataObj = returnObj;
						}
					});
				}
			}
		};

		this.processDupKeyValues = function ( refIndex, ix, dataObj ) {
			if (ix > 0) {
				var refData = this.delRef( refIndex );
				this.changeEveryIndex( refData[ 'name' ], refData[ 'content' ], refIndex);
			}
		};

		this.processDupKeys = function ( refIndex, ix, dataObj ) {
			if (ix > 0) {
				var refData = this.changeRefName( refIndex );
				this.changeIndex( refData[ 'oldName' ], refIndex, this.keys );
				this.addIndex( refData[ 'newName' ], refIndex, this.keys );
				this.removeIndex( refData[ 'oldName' ] + '_' + refData[ 'content' ], this.keyValues );
				this.addIndex( refData[ 'newName' ] + '_' + refData[ 'content' ], refIndex, this.keyValues );
			}
		};

		this.processDupValues = function ( refIndex, ix, dataObj ) {
			if (ix == 0) {
				// get TemplateReference object
				var refData = this.getRef( refIndex );
				return ( refData );
			} else {
				var delrefData = this.delRef( refIndex );
				this.removeIndex( delrefData[ 'name' ], this.keys );
				this.changeIndex( delrefData[ 'content' ], refIndex, this.values );
				this.removeIndex( delrefData[ 'name' ] + '_' + delrefData[ 'content' ], this.keyValues );
				// add old and new reference name into replacements array
				this.replacements[delrefData['name']] = dataObj['name'];
			}
		};

		this.delRef = function ( refIndex ) {
			var name = this.references[ refIndex ].name;
			var content = this.references[ refIndex ].content;
			this.references[ refIndex ] = null;
			return ({
				'name': name,
				'content': content
			});
		};

		this.changeRefName = function ( refIndex ) {
			var oldName = this.references[ refIndex ].name;
			var content = this.references[ refIndex ].content;
			var newName = this.getNewName ( oldName );
			this.references[ refIndex ].name = newName;
			return ({
				'oldName': oldName,
				'content': content,
				'newName': newName
			});
		};

		// Creates new reference name while making sure it is unique per template
		this.getNewName = function ( oldName ) {
			var prefix, randomValue, newName;

			randomValue = refcon.randomString( 5 );
			prefix = typeof oldName !== 'undefined' ? oldName + '_' : '';
			newName = prefix + randomValue;

			while ( newName in this.keys ) {
				randomValue = refcon.randomString( 5 );
				newName = prefix + randomValue;
			}
			return ( newName );
		}

		this.changeIndex = function ( key, refIndex, obj ) {
			var ix = obj[key].indexOf( refIndex );
			if (ix > -1)
				obj[key].splice( ix, 1 );
		};

		this.addIndex = function ( key, value, obj ) {
			obj[key] = [];
			obj[key].push( value );
		};

		this.removeIndex = function ( key, obj ) {
			delete obj[key];
		};

		this.getRef = function ( refIndex ) {
			return this.references[ refIndex ];
		};

		this.addRef = function ( reference ) {
			var count = this.references.push( reference );
			this.createIndexes( reference['name'], reference['content'], count - 1 );
		}

		this.delRef = function ( refIndex ) {
			var name = this.references[ refIndex ].name;
			var content = this.references[ refIndex ].content;
			this.references[ refIndex ] = null;
			return ({
				'name': name,
				'content': content
			});
		};

		this.changeEveryIndex = function ( key, value, refIndex ) {
			this.changeIndex( key, refIndex, this.keys );
			this.changeIndex( value, refIndex, this.values );
			this.changeIndex( key + '_' + value, refIndex, this.keyValues );
			// dupKeys, dupValues and dupKeyValues get changed by reference
		};
	}
};

$( refcon.init );

}( mw, jQuery ) );
	