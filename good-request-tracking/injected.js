(function () {
  // Prevent multiple injections
  if (window.__FETCH_XHR_INTERCEPTOR_LOADED__) {
    console.log('Interceptor already loaded, skipping...');
    return;
  }
  window.__FETCH_XHR_INTERCEPTOR_LOADED__ = true;
  
  console.log('🔍 Fetch/XHR Interceptor loaded');
  
  const sendToExtension = payload => {
    console.log(`📡 Intercepted ${payload.type.toUpperCase()} request:`, payload.request.url);
    window.postMessage({ __FROM_PAGE__: true, payload }, "*");
  };

  function makePatchedFetch(origFetch) {
    return async function patchedFetch(...args) {
      console.log('🚀 fetch() called with args:', args);
    const [input, init] = args;
    const requestInfo = {
      url: typeof input === 'string' ? input : input.url,
        method: (init && init.method) || (typeof input !== 'string' && input.method) || 'GET',
        body: (init && init.body) || null
    };
      console.log('🚀 fetch request info:', requestInfo);
      try {
        const response = await origFetch.apply(this, args);
    const cloned = response.clone();

        // Handle response body more robustly
        const contentType = cloned.headers.get('content-type') || '';
        let bodyPromise;
        if (contentType.includes('application/json') || contentType.includes('text') || contentType.includes('xml')) {
          bodyPromise = cloned.text();
        } else {
          bodyPromise = Promise.resolve(`[Binary data: ${cloned.headers.get('content-length') || 'unknown'} bytes]`);
        }

        bodyPromise.then(body => {
      sendToExtension({
        type: 'fetch',
        request: requestInfo,
        response: {
          status: cloned.status,
              statusText: cloned.statusText,
          headers: Object.fromEntries(cloned.headers.entries()),
          body
        }
      });
        }).catch(err => {
          sendToExtension({
            type: 'fetch',
            request: requestInfo,
            response: {
              status: cloned.status,
              statusText: cloned.statusText,
              headers: Object.fromEntries(cloned.headers.entries()),
              body: `[Error reading response: ${err.message}]`
            }
          });
    });

    return response;
      } catch (error) {
        sendToExtension({
          type: 'fetch',
          request: requestInfo,
          response: { status: 0, statusText: 'Network Error', headers: {}, body: `[Fetch failed: ${error.message}]` }
        });
        throw error;
      }
    };
  }

  // First patch immediately
  if (window.fetch) {
    window.__ORIG_FETCH__ = window.fetch;
    const patched = makePatchedFetch(window.fetch);
    window.__PATCHED_FETCH__ = patched;
    window.fetch = patched;
    console.log('✅ fetch interceptor installed');
  } else {
    console.warn('❌ fetch is not available on this page');
  }

  // Reapply patch if another script overwrites window.fetch
  const fetchGuard = setInterval(() => {
    if (window.fetch && window.fetch !== window.__PATCHED_FETCH__) {
      console.log('⚠️ fetch was overwritten, re-applying interceptor');
      window.__ORIG_FETCH__ = window.fetch;
      const patched = makePatchedFetch(window.fetch);
      window.__PATCHED_FETCH__ = patched;
      window.fetch = patched;
    }
  }, 500);

  // Ensure we clean up if the page unloads
  window.addEventListener('beforeunload', () => clearInterval(fetchGuard));







  // Enhanced XMLHttpRequest patching
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    console.log('📡 XMLHttpRequest.open() called:', method, url);
    this._interceptedMethod = method;
    this._interceptedUrl = url;
    this._interceptedRequestTime = Date.now();
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    this._interceptedBody = body;
    console.log('📡 XMLHttpRequest.send() called for:', this._interceptedUrl);

    // Add multiple event listeners for better coverage
    const handleResponse = () => {
      console.log('📡 XMLHttpRequest response received:', {
        url: this._interceptedUrl,
        status: this.status,
        readyState: this.readyState,
        responseType: this.responseType
      });

      try {
        // Parse headers into object format
        const headersString = this.getAllResponseHeaders();
        const headers = {};
        if (headersString) {
          headersString.split('\r\n').forEach(line => {
            const [key, ...valueParts] = line.split(': ');
            if (key && valueParts.length > 0) {
              headers[key.toLowerCase()] = valueParts.join(': ');
            }
          });
        }

        // Get response body based on response type
        let responseBody;
        const contentType = headers['content-type'] || '';
        
        if (this.responseType === '' || this.responseType === 'text') {
          responseBody = this.responseText;
        } else if (this.responseType === 'json') {
          responseBody = JSON.stringify(this.response);
        } else if (this.responseType === 'document') {
          responseBody = this.responseXML ? this.responseXML.documentElement.outerHTML : '[XML Document]';
        } else if (this.responseType === 'blob' || this.responseType === 'arraybuffer') {
          responseBody = `[Binary data: ${this.response?.size || 'unknown'} bytes]`;
        } else {
          responseBody = String(this.response || this.responseText || '[No response body]');
        }

        console.log('📡 Sending XHR data to extension:', {
          url: this._interceptedUrl,
          bodyLength: responseBody?.length,
          contentType
        });

        sendToExtension({
          type: 'xhr',
          request: {
            url: this._interceptedUrl,
            method: this._interceptedMethod,
            body: this._interceptedBody
          },
          response: {
            status: this.status,
            statusText: this.statusText,
            headers: headers,
            body: responseBody
          }
        });
      } catch (error) {
        console.error('📡 Error processing XMLHttpRequest response:', error);
        sendToExtension({
          type: 'xhr',
          request: {
            url: this._interceptedUrl,
            method: this._interceptedMethod,
            body: this._interceptedBody
          },
          response: {
            status: this.status,
            statusText: this.statusText,
            headers: {},
            body: `[Error reading response: ${error.message}]`
          }
        });
      }
    };

    // Add listeners for both load and readystatechange events
    this.addEventListener('load', handleResponse);
    this.addEventListener('readystatechange', () => {
      if (this.readyState === 4) {
        // Small delay to ensure response is fully processed
        setTimeout(handleResponse, 10);
      }
    });

    this.addEventListener('error', () => {
      console.log('📡 XMLHttpRequest error for:', this._interceptedUrl);
      sendToExtension({
        type: 'xhr',
        request: {
          url: this._interceptedUrl,
          method: this._interceptedMethod,
          body: this._interceptedBody
        },
        response: {
          status: this.status || 0,
          statusText: 'Network Error',
          headers: {},
          body: '[Network Error]'
        }
      });
    });

    return origSend.call(this, body);
  };

  console.log('✅ XMLHttpRequest interceptor installed');
})();