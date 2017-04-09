/**
 * References Consolidator (RefCon) is a Wikipedia gadget that converts all references in an article to list-defined format.
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

// Make sure the document is ready and dependencies are loaded
$.when (
	$.ready,
	mw.loader.using(['mediawiki.util', 'jquery.ui.draggable'])
	).done(function () {
		// Only load on appropriate namespaces
		var namespace = mw.config.get( 'wgNamespaceNumber' );
		if ( namespace === 0 || namespace === 2 ) {
			// Only load when editing wikitext (and not in common.js or common.css, for example)
			var contentModel = mw.config.get( 'wgPageContentModel' );
			if ( contentModel === 'wikitext' ) {
				// Configure the gadget for this particular wiki
				mw.config.set({
					'refcon-gadgetname': 'References Consolidator', //Gadget name
					'refcon-summary': 'Converted references to list-defined format with [[User:Cumbril/References Consolidator|References Consolidator]]', // Edit summary automatically added by RefCon
					'refcon-summaryseparator': ' + ', // Edit summary separator if summary is added to existing summary
					'refcon-linkname': 'Consolidate refs', //Portlet link name
					'refcon-linkhover': 'Consolidate references', //Text that is displayed when hovering above the link; link title
					'refcon-reftemplatenames': [ //List template {{reflist}} name and aliases that are used in wiki. Separate with commas. Put the main first.
						'reflist'
					],
					'refcon-reftemplategroupnames': [ //List template {{reflist}} 'group' parameter aliases that are used in wiki. Separate with commas. Put the main first.
						'group'
					],
					'refcon-reftemplaterefsnames': [ //List template {{reflist}} 'refs' parameter aliases that are used in wiki. Separate with commas. Put the main first.
						'refs'
					],
					'refcon-sortrefs': 'user',	// Whether references will be sorted alphabetically in reference template.
												// Value can be 'yes', 'no', 'user'
					'refcon-usetemplateR': 'user',	// Whether to use template {{R}} for citations. See [[:en:Template:R]].
													// Value can be 'yes', 'no', 'user'
					'refcon-image-yes': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Yes_check.svg/240px-Yes_check.svg.png',
					'refcon-image-no': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/X_mark.svg/210px-X_mark.svg.png'
				});
				mw.messages.set({
					'refcon-parsereferror': "This reference string caused error:\n$1",
					'refcon-parserefforbidden': "Reference name contains forbidden characters [$1]:\n$2",
					'refcon-name': "Name",
					'refcon-reference': "Reference",
					'refcon-refstemplateno': "Reference list template no.",
					'refcon-referencegroup': "reference group",
					'refcon-buttonabort': "Abort",
					'refcon-buttoncontinue': "Continue",
					'refcon-referenceuses': "Uses",
					'refcon-closetitle': "Close window",
					'refcon-checkboxsortorder': "Save in selected sorting order"
				});
				mw.loader.load( '/w/index.php?title=User:Cumbril/RefConsolidate.css&action=raw&ctype=text/css', 'text/css' );
				// cache loaded scripts for faster loading
				$.ajaxSetup({
					cache: true
				});
				// load xmlToJSON
				$.getScript( '/w/index.php?title=User:Cumbril/XmlToJSON.min.js&action=raw&ctype=text/javascript', function() {
					// load the main script
					mw.loader.load( '/w/index.php?title=User:Cumbril/RefConsolidate.js&action=raw&ctype=text/javascript', 'text/javascript' );
				});
			}
		}
	}
);