/*global safari, SafariBrowserTab, SafariBrowserWindow */

/**
 * @fileOverview This file adds Safari support for those APIs:
 * TODO
 * @name background.js<safari>
 * @author Etienne Prud’homme
 * @license MIT
 * Note:
 * Injected Scripts don’t have access to the `chrome.*` API with the exception of:
 * * `extension` (`getURL`, `inIncognitoContext`, `lastError`, `onRequest`, `sendRequest`)
 * * `i18n`
 * * `runtime` (`connect`, `getManifest`, `getURL`, `id`, `onConnect`, `onMessage`, `sendMessage`)
 * * `storage`
 * This is wĥy this background script is created.
 */

// Initializes the logs if not created
safari.extension.settings.logs = safari.extension.settings.logs || [];

/**
 * Adaptee that translates chrome method behavior to safari.
 * @namespace
 * @property {error} wrapper.runtime.lastError - Set for the lifetime of a callback if an ansychronous extension api has resulted in an error. If no error has occured lastError will be undefined.
 */
var wrapper = {
  storage: {
    sync: {
      /**
       * Emulates the chrome storage behavior (getter) by using the {@link safari.extension.settings} mechanism.
       * @param {string|string[]|object} keys - A single key to get, list of keys to get, or a dictionary specifying default values (see description of the object). An empty list or object will return an empty result object. Pass in null to get the entire contents of storage.
       * @returns {object} Object with items in their key-value mappings.
       * @throws {error} Error in the {@link keys} argument and sets {@link wrapper.runtime.lastError}.
       */
      get: function(keys) {
        var i, len, key, items = {};
        try {
          if(!keys) {
            if(keys === null) {
              items = safari.extension.settings;
            } else {
              // Only `null` can return values, otherwise it’s an empty Object
              items = {};
            }
          } else if(keys instanceof String || typeof keys === 'string') {
            items[keys] = safari.extension.settings[keys];
          } else if(keys instanceof Array && keys.length > 0) {
            items = {};

            for(i=0, len=keys.length; i<len; i++) {
              key = keys[i];
              if(!(key instanceof String || typeof key === 'string')) {
                extensionLog(new Error('An item of the `keys` array wasn’t a String'));
              }
              items[key] = safari.extension.settings[key];
            }
          } else {
            // Otherwise it can be any Objects with properties as keys.
            items = {};
            // Only a coincidence if they got the same names.
            var value, keysArray = Object.keys(keys);

            if(keysArray.length === 0) {
              extensionLog(new Error('The `keys` object does not contain any property on its own'));
            }

            for(i=0, len=keysArray.length; i<len; i++) {
              key = keysArray[i];
              value = safari.extension.settings[key];
              // Return the default value if the key isn’t present in settings
              items[key] = value !== undefined ? value : keys[key];
            }
          }
        } catch(e) {
          wrapper.runtime.lastError = e;
          items = -1;
        }
        return items;
      },
      /**
       * Emulates the chrome storage behavior (setter) by using the {@link safari.extension.settings} mechanism.
       * @param {} keys - An object which gives each key/value pair to update storage with. Any other key/value pairs in storage will not be affected.
       * Primitive values such as numbers will serialize as expected. Values with a typeof `object` and `function` will typically serialize to `{}`, with the exception of `Array` (serializes as expected), Date, and Regex (serialize using their `String` representation).
       * @returns {int} 0 on success and -1 on error.
       * @throws {error} Error in the {@link keys} argument and sets {@link wrapper.runtime.lastError}.
       */
      set: function(keys) {
        try {
          if(!keys || keys instanceof String || typeof keys === 'string' || keys instanceof Array) {
            extensionLog(new Error('The `keys` argument is not a valid Object with keys/properties'));
          }

          var key, i, len, keysArray = Object.keys(keys);

          if(keysArray.length === 0) {
            extensionLog(new Error('The `keys` object does not contain any property on its own'));
          }

          for(i=0, len=keysArray.length; i<len; i++) {
            key = keysArray[i];
            safari.extension.settings[key] = keys[key];
          }
        } catch (e) {
          wrapper.runtime.lastError = e;
          return -1;
        }
        return 0;
      }
    }
  },
  runtime: {
    lastError: null
  },
  tabs: {
    /**
     * @param {int} tabId - The tab to send the message to.
     * @param {*} message - Any object that can be serialized.
     * @todo @param {object} [options]
     * @todo @param {int} [options.frameId] - Send a message to a specific frame identified by {@link frameId} instead of all frames in the tab.
     */
    sendMessage: function(tabId, message, options) {

    },
    /**
     * Gets all tabs that have the specified properties, or all tabs if no properties are specified.
     * @param {object} queryInfo
     * @param {bool} [queryInfo.active] - TODO Whether the tabs are active in their windows. (Does not necessarily mean the window is focused.)
     * @param {bool} [queryInfo.currentWindow] - TODO Whether the tabs are in the /current window/. Note: the current window doesn’t mean it’s the active one. It means that the window is currently executing.
     * @todo param {string} tabId - The tab to return
     * @returns {int|Object[]} Result of the query of -1 on error.
     */
    query: function(queryInfo) {
      var validQuery, windows, tabs;
      try {
        validQuery = false;
        windows = safari.application.browserWindows;
        tabs = [];

        if(queryInfo instanceof Object) {
          // queryInfo.currentWindow
          if(queryInfo.currentWindow) {
            // Because there’s no way I know to select the window currently running in Safari, the active window (or `lastFocusedWindow` one if null) will be used instead. If someone successfully thriggers an action page that isn’t focused, it’s an undefined behavior.
            windows = registry.getActiveWindow();
            if(windows === null) {
              windows = registry.getLastFocused();
            }
            // Put it in an array
            windows = [windows];
            validQuery = true;
          }

          // queryInfo.active
          if(queryInfo.active === true) {
            tabs = makeTabType(activeTabs(windows));
            validQuery = true;
          } else {
            tabs = makeTabType(getTabs(windows));
            validQuery = true;
          }
        }

        // TODO: Validate queries
        if(!validQuery) {
          extensionLog(new Error('No valid query is specified'));
        }

        /**
         * Gets all active {@link SafariBrowserTab} from given an array {@link SafariBrowserWindow},
         * @param {SafariBrowserWindow[]} windows - Windows to get all active tabs.
         * @returns {SafariBrowserTabs[]} Array of active tabs.
         */
        function activeTabs(windows) {
          var resultTabs = [], index, i, len;

          for(i=0, len=windows.length; i<len; i++) {
            // It makes a copy of the object
            resultTabs.push(windows[i].activeTab);
          }
          return resultTabs;
        }

        /**
         * Gets all tabs from given windows.
         * @param {SafariBrowserWindow[]} windows - An array of {@link SafariBrowserWindow}.
         * @returns {SafariBrowserTab[]} List of tabs from {@link windows}.
         */
        function getTabs(windows) {
          var i, len, u, u_len, windowTabs, index, resultTabs = [];
          for(i=0, len=windows.length; i<len; i++) {
            windowTabs = windows[i].tabs;
            for(u=0, u_len=windowTabs.length; u<u_len ;) {
              resultTabs.push(windowTabs[u]);
            }
          }
          return resultTabs;
        }

        /**
         * Makes a Tab type.
         * @param {SafariBrowserTab[]} tabs - Array of SafariBowserTab.
         * @returns {Tab[]} Chrome formatted Tab type.
         */
        function makeTabType(tabs){
          var resultTabs = [], i, len, currentTab, tab;

          for(i=0, len=tabs.length; i<len; i++) {
            tab = tabs[i];
            currentTab = {
              id: tab.id
              // All other parts may change
            };
            resultTabs.push(currentTab);
          }
          return resultTabs;
        }
      } catch(e) {
        wrapper.runtime.lastError = e;
        return -1;
      }
      return tabs;
    }
  }
};

// Listens to the client adapter
safari.application.addEventListener('message', function(event) {
  var status = -1;
  var message = JSON.parse(event.message);

  // Safari uses ev.name for the name of the event while using /message/ for communication between scripts.
  switch(event.name) {
  case 'wrapper.storage.sync.get':
    // Returns -1 on error otherwise the response
    status = wrapper.storage.sync.get(message.keys);
    respondBack('chrome.storage.sync.get', status);
    break;
  case 'wrapper.storage.sync.set':
    // Returns -1 on error otherwise the response
    status = wrapper.storage.sync.set(message.keys);
    respondBack('chrome.storage.sync.set', status);
    break;
  case 'wrapper.runtime.sendMessage':
    // TODO
    // Returns -1 on error otherwise the response
    status = wrapper.runtime.sendMessage();
    respondBack('chrome.runtime.sendMessage', status);
    break;
  case 'wrapper.tabs.query':
    // Returns -1 on error otherwise the response
    status = wrapper.tabs.query(message.query);

    // Note: The docs don’t officially specify throwing lastError
    respondBack('chrome.tabs.query', status);
    break;
  }

  /**
   * Function that sends back the result of the request and also take cares of status codes.
   * @param {string} channel - The name of the request receiver.
   * @param {int|Object} status - The response of a query. On error, it should be `-1`.
   */
  function respondBack(channel, status) {
    var response;
    if(status === -1) {
      response = {name: 'error', response: wrapper.runtime.lastError.message};
    } else {
      response = {name: 'ok', response: status};
    }
    event.target.page.dispatchMessage(channel, JSON.stringify(response));
  }
  // Since its lifetime is for a callback
  wrapper.runtime.lastError = undefined;
}, false);


// background.js<safari>