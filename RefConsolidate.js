/**
 * RefCon (References Consolidator) is a Wikipedia gadget that converts all references in an article to list-defined format.
 * It supports multiple reference templates and reference group names.
 * 
 * Copyright 2016–2017 Cumbril
 *
 * Parts of RefCon are derived from Wikipedia gadget ProveIt:
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
	 * Convenience method to get a RefCon option
	 *
	 * @param {string} option key without the "refcon-" prefix
	 * @return {string} option value
	 */
	getOption: function ( key ) {
		return mw.config.get( 'refcon-' + key );
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
		}
		// Set minor edit checkbox and click View Differences button
		document.forms.editform.wpMinoredit.checked = true;
		document.forms.editform.wpDiff.click();
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

							if ( typeof part[ j ].value[0]['_text'] !== 'undefined' ) {
								value = part[ j ].value[0]['_text'];
							} else if ( typeof part[ j ].value[0]['ext'] !== 'undefined' ) {
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
				
				referenceName = params['name'] ? params['name'] : '';
				referenceGroup = params['group'] ? params['group'] : '';
			}
		}
		
		if ( typeof referenceGroup === 'undefined' )
			referenceGroup = '';
		
		if ( typeof referenceName === 'undefined' )
			referenceName = '';		
		
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
	 * reference template. Update indexes. Create citation object for the reference in TextPart object
	 *
	 * @param {object} TextPart object
	 */	
	
	processTextPartRefs: function ( textPart ) {
		var i, reference, refTemplateIx, refTemplate, templateRef;

		for ( i = 0; i < textPart.references.length; i++ ) {
			reference = textPart.references[ i ];
			
			refTemplateIx = textPart.inTemplates[ reference.group ];
			refTemplate = refcon.refTemplates[ refTemplateIx ];

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
							'name': reference.name
						});
						reference.citation = citation;

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
							'content': reference.content
						});							
						
						refTemplate.addRef( newRef );
						
						var citation = new refcon.Citation({
							'group': reference.group,
							'name': newName
						});							
						reference.citation = citation;
						
						// add names into replacements object, so we can replace all citation names that use the old name
						
						refTemplate.replacements[ reference.name ] = newName;
						
						continue;
					}
				}
				
				// Check if the reference has the same content but different name than template reference
				templateRef = refcon.getRefByIndex( refTemplate, 'values', reference.content );

				if ( typeof templateRef === 'object' ) {
					if ( templateRef.content === reference.content && templateRef.name !== reference.name ) {
						// found reference with the same content but different name

						// drop reference name, use template reference name for citation
						var citation = new refcon.Citation({
							'group': reference.group,
							'name': templateRef.name
						});
						reference.citation = citation;

						// add names into replacements object, so we can replace all citation names that use the old name
						refTemplate.replacements[ reference.name ] = templateRef.name;

						continue;
					}
				}
				
				// If we get here, it means we've got a named reference that has not yet been described in reference template
				// add the reference to template references
				
				var newRef = new refcon.Reference({
					'group': reference.group,
					'name': reference.name,
					'content': reference.content
				});
				refTemplate.addRef( newRef );

				var citation = new refcon.Citation({
					'group': reference.group,
					'name': reference.name
				});
				reference.citation = citation;
			}
		}

		for ( i = 0; i < textPart.references.length; i++ ) {
			reference = textPart.references[ i ];
			
			refTemplateIx = textPart.inTemplates[ reference.group ];
			refTemplate = refcon.refTemplates[ refTemplateIx ];
		
			// Now we go through unnamed references
			if ( reference.content.length > 0 && reference.name.length === 0 ) {

				templateRef = refcon.getRefByIndex( refTemplate, 'values', reference.content );

				if ( typeof templateRef === 'object' ) {
					if ( templateRef.content === reference.content ) {
						// found reference with the same content

						var citation = new refcon.Citation({
							'group': reference.group,
							'name': templateRef.name
						});
						reference.citation = citation;

						continue;
					}
				}
				// If we get here, we have a completely new unnamed reference
				// add the reference to template references

				var newName = refTemplate.getNewName();
	
				var newRef = new refcon.Reference({
					'group': reference.group,
					'name': newName,
					'content': reference.content
				});

				refTemplate.addRef( newRef );

				var citation = new refcon.Citation({
					'group': reference.group,
					'name': newName
				});
				reference.citation = citation;
			}
		}
	},
	
	/**
	 * Replace all references in TextPart object string with citations. Also replace citation names that were changed in previous steps
	 *
	 * @param {object} TextPart object
	 */	
	
	replaceTextPartRefs: function ( textPart ) {
		var i, reference, citation, replaceString, refTemplateIx, refTemplate, replaceName;
		
		for ( i = 0; i < textPart.references.length; i++ ) {
			reference = textPart.references[ i ];
			
			if ( typeof reference.citation === 'object' ) {
				citation = reference.citation;
				
				if ( typeof citation === 'object' && citation.name.length > 0 ) {
					replaceString = citation.toString();
					textPart.string = textPart.string.replace( reference.string, replaceString );
				}
			}
		}
		
		for ( i = 0; i < textPart.citations.length; i++ ) {
			citation = textPart.citations[ i ];
			
			refTemplateIx = textPart.inTemplates[ citation.group ];
			refTemplate = refcon.refTemplates[ refTemplateIx ];
			
			if ( citation.name.length > 0 ) {
				
				// If there is replacement name in replacements object, replace the citation name
				replaceName = refTemplate.replacements[ citation.name ];
				
				if ( typeof replaceName !== 'undefined' ) {
					citation.name = replaceName;
				}				
				
				replaceString = citation.toString();
				textPart.string = textPart.string.replace( citation.string, replaceString );
			}
		}		
	},
	
	/**
	 * Build reference templates
	 *
	 * @param {object} RefTemplate object
	 */	
	
	buildRefTemplates: function ( refTemplate ) {
		var i, reference, referencesString = '', refsAdded = false, sortRefs = false;

		// sort references depending on config and user config settings
		var sortRefsOption = refcon.getOption( 'sortrefs' );

		switch ( sortRefsOption ) {
		  case 'yes':
			sortRefs = true;
			break;
		  case 'no':
			sortRefs = false;
			break;
		  case 'user':
			if ( typeof refConsolidateConfig === 'object' && typeof refConsolidateConfig.sort !== 'undefined' && refConsolidateConfig.sort === true ) {
				sortRefs = true;
			}
			break;
		  default:
			sortRefs = false;
		}

		if ( sortRefs ===  true ) {
			var contentLanguage = mw.config.get( 'wgContentLanguage' );

			refTemplate.references.sort( function( a,b ) {
				return a.name.localeCompare( b.name, contentLanguage);
			});
		}

		for ( i = 0; i < refTemplate.references.length; i++ ) {
			reference = refTemplate.references[ i ];
			if ( reference ) {
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
		
		// Build the references template string
		if ( Object.keys( refTemplate.params ).length > 0 ) {
			for ( var name in refTemplate.params ) {
				var value = refTemplate.params[ name ];
				
				if ( refsNames.indexOf( name ) > -1 ) {
					name = refsName;
					value = "\n" + referencesString;
					refsAdded = true;
				}
				templateString += '|' + name + '=' + value;
			}
		}
		
		if ( refsAdded === false ) {
			templateString += '|' + refsName + "=\n" + referencesString;
		}

		templateString += "\n}}";
		
		refTemplate.string = templateString;		
	},
	

	/**
	 * Write text parts and reference templates into textbox variable
	 *
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
		 * Reference objects array.
		 */
		
		this.references = [];
		
		/**
		 * Citation objects array that have their reference defined outside text part (i.e. in other text part or references template)
		 */
		
		this.citations = [];

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
			
			var string = '<ref';
			if ( this.name ) {
				string += ' name="' + this.name + '"';
			}
			if ( this.group ) {
				string += ' group="' + this.group + '"';
			}			
			string += ' />';

			return string;
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
		 * Object that contains citation constructed to this reference
		 */
		this.citation = {};
		
		/**
		 * Convert this reference to wikitext
		 */
		this.toString = function () {
			var string = '<ref name="' + this.name + '">' + this.content + '</ref>';
			return string;
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
