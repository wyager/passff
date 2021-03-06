/* jshint node: true */
'use strict';

PassFF.Menu = (function () {
  /**
    * Controls the browser action menu for the PassFF extension as well as the
    * item picker (during HTTP auth requests).
    */

/* #############################################################################
 * #############################################################################
 *  Menu state handlers
 * #############################################################################
 */

  var menuState = {
    search_val: "",
    items: null
  };

  function restoreFromState(stateObj) {
    if (typeof stateObj !== "undefined") {
      menuState = stateObj;
    }

    if (PassFF.mode === "itemPicker") {
      let data_box = document.querySelector(".itemPickerTarget");
      data_box.textContent = menuState['itemPickerTarget'];
      data_box.title = menuState['itemPickerTarget'];
    }

    let searchInput = document.getElementById('passff-search-box');
    searchInput.value = menuState['search_val'];
    createMenuList();
    searchInput.focus();
  }

/* #############################################################################
 * #############################################################################
 *  Event handlers
 * #############################################################################
 */

// %%%%%%%%%%%%%%%%%%%%% Search bar key events %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  function onSearchKeypress(event) {
    log.debug('Search keydown', event.keyCode);

    if (event.ctrlKey || event.altKey) {
      return false;
    }

    if (event.keyCode == 37 ||event.keyCode == 39) {
      /*  LEFT ARROW, RIGHT ARROW
        We let the user interact with his search input (if there is any)
        in the usual way. However, if there is no input, we assume arrow key
        strokes to pertain to the item selector (see below).
      */
      let searchInput = document.getElementById('passff-search-box');
      if (searchInput.value.length > 0) return false;
    }

    if (event.keyCode == 40 || event.keyCode == 13 || event.keyCode == 39) {
      /* DOWN ARROW, RETURN, RIGHT ARROW */
      let listElm = document.getElementById('passff-entries-list');

      if (listElm.firstChild) {
        log.debug('Select first child');
        listElm.firstChild.selected = true;
        if (event.keyCode != 39) {
          listElm.focus();
        }
      }

      event.stopPropagation();
    }
    keyPressManagement(event);

    return false;
  }

  function onSearchKeyup(event) {
    log.debug('Search keyup', event);

    if (event.keyCode <= 46 && event.keyCode != 8) {
      /* non-alphanumeric and not BACKSPACE */
      if (event.keyCode == 27 && PassFF.mode === "itemPicker") {
        /* ESCAPE */
        window.close();
      }
      return false;
    }

    if("" == event.target.value) {
      createContextualMenu();
      return false;
    }

    menuState['search_val'] = event.target.value;
    createMenuList(
      PassFF.Pass.getMatchingItems(event.target.value, 6));
  }

// %%%%%%%%%%%%%%%%%%%%% Selection controlling %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  function onListItemkeydown(event) {
    log.debug('List item keydown', event.keyCode);
    keyPressManagement(event);
  }

  function keyPressManagement(event) {
    let listElm = document.getElementById('passff-entries-list');

    if (event.keyCode == 13) {
      /* RETURN */
      if (listElm.selectedIndex < 0) {
        return;
      } else if (listElm[listElm.selectedIndex].onEnterPress) {
        listElm[listElm.selectedIndex].onEnterPress(event);
      } else {
        listElm[listElm.selectedIndex].click();
      }
    } else if (event.keyCode == 39) {
      /* RIGHT ARROW */
      let itemId = getItem(listElm[listElm.selectedIndex]);
      if (itemId !== null) {
        createMenuList(itemId);
      }
    } else if (event.keyCode == 37) {
      /* LEFT ARROW */
      if (listElm.firstChild.textContent === '..') {
        let itemId = getItem(listElm.firstChild);
        if (itemId !== null) {
          createMenuList(itemId);
          return;
        }
      }
      menuState['items'] = PassFF.Pass.rootItems;
      createMenuList();
    } else if (!event.shiftKey && event.keyCode != 40 && event.keyCode != 38) {
      /* NOT: SHIFT, DOWN ARROW, UP ARROW */
      document.getElementById('passff-search-box').focus();
    }
  }

  function onListItemSelected(event) {
    let itemId = getItem(event.target);
    log.debug("List item", itemId, "selected");

    if (itemId !== null) {
      createMenuList(itemId);
    } else {
      createMenuList(PassFF.Pass.rootItems);
    }
  }

// %%%%%%%%%%%%%%%%%%% Button bar button commands %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  function onContextButtonCommand(event) {
    log.debug('Context button command');
    createContextualMenu();
  }

  function onRootButtonCommand(event) {
    log.debug('Root button command');
    menuState['items'] = PassFF.Pass.rootItems;
    let searchInput = document.getElementById('passff-search-box');
    searchInput.value = "";
    searchInput.focus();
    createMenuList();
  }

  function onRefreshButtonCommand(event) {
    log.debug('Refresh button command');
    let messages = document.getElementsByClassName('message');
    [].forEach.call(messages, (el) => { el.parentNode().removeChild(el); });
    PassFF.refresh_all().then(createContextualMenu());
  }

  function onPrefButtonCommand(event) {
    log.debug('Preferences button command');
    browser.runtime.openOptionsPage();
    window.close()
  }

  function onNewPassButtonCommand(event) {
    log.debug('New password button command');
    PassFF.Pass.newPasswordUI();
    window.close();
  }

/* #############################################################################
 * #############################################################################
 *  Menu list DOM creators
 * #############################################################################
 */

  function createContextualMenu() {
    log.debug("Create contextual menu");
    let searchInput = document.getElementById('passff-search-box');
    searchInput.value = "";
    searchInput.focus();
    createMenuList(PassFF.Pass.contextItems);
  }

  function createMenuList(items, cleanMenu) {
    if (typeof cleanMenu === "undefined") {
      cleanMenu = true;
    }
    if (typeof items !== "undefined") {
      menuState['items'] = items;
      PassFF.Menu.backupState(menuState);
    }
    log.debug("Create menu list", menuState['items']);
    if (menuState['items'] instanceof Array) {
      createItemsMenuList(menuState['items'], cleanMenu);
    } else if (menuState['items'] !== null)  {
      createItemMenuList(menuState['items']);
    } else {
      createContextualMenu();
    }
  }

  function createItemsMenuList(items, cleanMenu) {
    if (typeof cleanMenu === "undefined") cleanMenu = true;
    log.debug("Create children menu list", items, cleanMenu);

    if (cleanMenu) clearMenuList();
    let listElm = document.getElementById('passff-entries-list');
    items.forEach(function (item) {
      if (item.isField) return;
      let onEnter = null;
      if (item.isLeaf || item.hasFields) {
        onEnter = function (event) {
          if (PassFF.mode === "itemPicker") {
            PassFF.Menu.onPickItem(getItem(this));
          } else {
            PassFF.Menu.onEnter(getItem(this), event.shiftKey);
            window.close();
          }
        };
      }
      let label = item.fullKey;
      if (label != '..' && !item.isLeaf) {
        label += '/';
      }
      listElm.appendChild(
        createMenuItem(item, label, onListItemSelected, null, onEnter)
      );
    });
  }

  function createItemMenuList(itemId) {
    let item = PassFF.Pass.getItemById(itemId);
    log.debug("Create item menu", item.fullKey);

    if (PassFF.mode === "itemPicker" && (item.hasFields || item.isLeaf)) {
      PassFF.Menu.onPickItem(item.id);
      return;
    }

    clearMenuList();
    if (item.hasFields || item.isLeaf) {
      createLeafMenuList(item);
    }

    if (!item.isLeaf) {
      createItemsMenuList(item.children.map(PassFF.Pass.getItemById), false);
    }

    let listElm = document.getElementById('passff-entries-list');
    let newItem = createMenuItem(PassFF.Pass.getItemById(item.parent), '..',
      onListItemSelected);
    listElm.insertBefore(newItem, listElm.firstChild);
  }

  function createLeafMenuList(item) {
    clearMenuList();

    log.debug('Create leaf menu list', item.fullKey);
    let listElm = document.getElementById('passff-entries-list');

    [ ['passff_menu_fill', PassFF.Menu.onAutoFillMenuClick],
      ['passff_menu_fill_and_submit', PassFF.Menu.onAutoFillAndSubmitMenuClick],
      ['passff_menu_goto_fill_and_submit', PassFF.Menu.onGotoAutoFillAndSubmitMenuClick],
      ['passff_menu_goto', PassFF.Menu.onGoto],
      ['passff_menu_copy_login', PassFF.Menu.onCopyToClipboard, 'login'],
      ['passff_menu_copy_password', PassFF.Menu.onCopyToClipboard, 'password'],
      ['passff_menu_display', PassFF.Menu.onDisplayItemData]
    ].forEach(function (data) {
      let onClick = function (event) {
        event.stopPropagation();
        let itemId = getItem(event.target);
        let dataKey = getDataKey(event.target);
        data[1](itemId, dataKey, event.button !== 0);
        window.close();
      };
      let at = (data.length == 3) ? data[2] : undefined;
      let newItem = createMenuItem(item, _(data[0]), onClick, at);
      listElm.appendChild(newItem);
    });
  }

  function createMenuItem(item, label, onClick, attribute, onEnterPress) {
    let listItemElm = document.createElement('option');
    listItemElm.item = (item === null) ? null : item.id;
    listItemElm.dataKey = attribute;
    listItemElm.addEventListener('click', onClick);

    listItemElm.onEnterPress = onEnterPress;
    listItemElm.textContent = label;

    return listItemElm;
  }

  function clearMenuList() {
    let listElm = document.getElementById('passff-entries-list');
    while (listElm.hasChildNodes()) {
      listElm.removeChild(listElm.firstChild);
    }
  }

/* #############################################################################
 * #############################################################################
 *  Misc. DOM handlers
 * #############################################################################
 */

  function logAndDisplayError(errorMessage) {
    return (error) => {
      log.error(errorMessage, ":", error);
      addMessage(_("passff_errors_unexpected_error"));
    };
  }

  function addMessage(message, severity) {
    let body  = document.body,
        panel = document.createElement('div'),
        dismissControl = document.createElement('a'),
        messageNode = document.createTextNode(message);
    if (typeof severity === 'undefined') severity = 'error';
    panel.classList.add('message', severity);
    dismissControl.classList.add('dismiss');
    dismissControl.textContent = '&times;';
    dismissControl.addEventListener('click', () => body.removeChild(panel));
    panel.appendChild(dismissControl);
    panel.appendChild(messageNode);
    body.insertAdjacentElement('beforeend', panel);
  }

  function getDataKey(node) {
    while (node && node.dataKey === undefined) {
      node = node.parentNode;
    }
    return node ? node.dataKey : null;
  }

  function getItem(node) {
    while (node && node.item === undefined) {
      node = node.parentNode;
    }
    return node ? node.item : null;
  }

/* #############################################################################
 * #############################################################################
 *  Helper for DOM initialization
 * #############################################################################
 */

  function init_ui() {
    let searchBox = document.getElementById('passff-search-box');
    searchBox.setAttribute('placeholder',
                                    _('passff_toolbar_search_placeholder'));
    searchBox.addEventListener('click', function (e) { e.target.select(); });
    searchBox.addEventListener('keypress', onSearchKeypress);
    searchBox.addEventListener('keyup', onSearchKeyup);

    let entryList = document.getElementById('passff-entries-list');
    entryList.addEventListener('keydown', onListItemkeydown);

    let showAllButton = document.querySelector('.actions div:nth-child(1) > button');
    showAllButton.textContent = _('passff_button_root_label');
    showAllButton.addEventListener('click', onRootButtonCommand);

    let showMatchingButton = document.querySelector('.actions div:nth-child(2) > button');
    showMatchingButton.textContent = _('passff_button_context_label');
    showMatchingButton.addEventListener('click', onContextButtonCommand);

    let refreshButton = document.querySelector('.actions button.reload');
    refreshButton.setAttribute('title', _('passff_toolbar_refresh_label'));
    refreshButton.addEventListener('click', onRefreshButtonCommand);

    if (PassFF.mode === "menu") {
      let prefsButton = document.querySelector('.actions button.config');
      prefsButton.setAttribute('title', _('passff_toolbar_preferences_label'));
      prefsButton.addEventListener('click', onPrefButtonCommand);

      let newPasswordButton = document.querySelector('.actions button.add');
      if (!PassFF.Preferences.showNewPassButton) {
        let newPasswordDiv = newPasswordButton.parentNode;
        newPasswordDiv.parentNode.removeChild(newPasswordDiv);
      } else {
        newPasswordButton.setAttribute('title',
                              _('passff_toolbar_new_password_label'));
        newPasswordButton.addEventListener('click', onNewPassButtonCommand);
      }
    } else if (PassFF.mode === "itemPicker") {
      window.onresize = function onresize() {
        // Rescale select box to fit window's height
        let data_box = document.querySelector(".itemPickerTarget");
        let data_height = data_box.offsetHeight;
        let bar_height = document.querySelector("div.searchbar").offsetHeight;
        let buttonbox_height = document.querySelector("div.buttonbox").offsetHeight;
        document.getElementById('passff-entries-list').style.height =
          (window.innerHeight - data_height - bar_height - buttonbox_height)
          + "px";
      }
      onresize();
    }
  }

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
    init: function () {
      init_ui();
      return PassFF.Menu.getLastState().then(restoreFromState);
    },

    onContextChanged: function (url) {
      menuState['items'] = PassFF.Pass.contextItems;
      menuState['search_val'] = "";
    },

// %%%%%%%%%%%%%%%%%%%%%% Menu state manipulation %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    backupState: background_function("Menu.backupState",
      (stateObj) => { menuState = stateObj; }),

    getLastState: background_function("Menu.getLastState",
      () => { return menuState; }),

    get state() {
      return menuState;
    },

// %%%%%%%%%%%%% Event handlers that are delegated to background %%%%%%%%%%%%%%%

    onEnter: background_function("Menu.onEnter", function (itemId, shiftKey) {
      let item = PassFF.Pass.getItemById(itemId);
      log.debug("Enter press on item", item.fullKey, shiftKey);
      switch (PassFF.Preferences.enterBehavior) {
        case 0:
          //goto url, fill, submit
          PassFF.Page.goToItemUrl(item, shiftKey, true, true);
          break;
        case 1:
          //goto url, fill
          PassFF.Page.goToItemUrl(item, shiftKey, true, false);
          break;
        case 2:
          //fill, submit
          PassFF.Page.fillInputs(null, item, true);
          break;
        case 3:
          //fill
          PassFF.Page.fillInputs(null, item, false);
          break;
      }
    }),

    onPickItem: background_function("Menu.onPickItem", function (itemId) {
      let item = PassFF.Pass.getItemById(itemId);
      PassFF.Auth.resolve(item);
    }),

    onAutoFillMenuClick: background_function("Menu.onAutoFillMenuClick",
      function (itemId) {
        PassFF.Page.fillInputs(null, PassFF.Pass.getItemById(itemId), false);
      }
    ),

    onAutoFillAndSubmitMenuClick: background_function(
      "Menu.onAutoFillAndSubmitMenuClick",
      function (itemId) {
        PassFF.Page.fillInputs(null, PassFF.Pass.getItemById(itemId), true);
      }
    ),

    onGoto: background_function("Menu.onGoto",
      function (itemId, dataKey, rightClick) {
        let item = PassFF.Pass.getItemById(itemId);
        PassFF.Page.goToItemUrl(item, rightClick, false, false);
      }
    ),

    onGotoAutoFillAndSubmitMenuClick: background_function(
      "Menu.onGotoAutoFillAndSubmitMenuClick",
      function (itemId, dataKey, rightClick) {
        let item = PassFF.Pass.getItemById(itemId);
        PassFF.Page.goToItemUrl(item, rightClick, true, true);
      }
    ),

    onDisplayItemData: background_function("Menu.onDisplayItemData",
      function (itemId, dataKey, rightClick) {
        let item = PassFF.Pass.getItemById(itemId);
        PassFF.Pass.displayItem(item);
      }
    ),

    onCopyToClipboard: background_function("Menu.onCopyToClipboard",
      function (itemId, dataKey, rightClick) {
        let item = PassFF.Pass.getItemById(itemId);
        PassFF.Pass.getPasswordData(item)
          .then((passwordData) => {
            if (typeof passwordData === "undefined") return;
            PassFF.Page.copyToClipboard(passwordData[dataKey]);
          });
      }
    )
  };
})();
