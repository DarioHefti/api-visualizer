(function () {
  // Prevent multiple injections
  if (window.__FETCH_XHR_INTERCEPTOR_LOADED__) {
    console.log('API Data Visualizer interceptor already loaded, skipping...');
    return;
  }
  window.__FETCH_XHR_INTERCEPTOR_LOADED__ = true;

  console.log('🔍 API Data Visualizer interceptor loaded');

  const sendToExtension = payload => {
    console.log(`📡 Intercepted ${payload.type.toUpperCase()} request:`, payload.request.url);
    window.postMessage({ __FROM_PAGE__: true, payload }, "*");
  };

  const isJsonContentType = (val = '') => /^(?:application)\/(?:json|[a-z0-9.+-]*\+json)\b/i.test(val);

  function normalizeHeaders(headers) {
    try {
      return Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
    } catch {
      return headers || {};
    }
  }

  function makePatchedFetch(origFetch) {
    return async function patchedFetch(...args) {
      const [input, init] = args;
      const requestInfo = {
        url: typeof input === 'string' ? input : input.url,
        method: (init && init.method) || (typeof input !== 'string' && input.method) || 'GET',
        body: (init && init.body) || null
      };

      try {
        const response = await origFetch.apply(this, args);
        const cloned = response.clone();

        const contentType = cloned.headers.get('content-type') || '';
        if (!isJsonContentType(contentType)) {
          return response; // Only forward JSON
        }

        const bodyText = await cloned.text();
        if (bodyText && bodyText.trim().length) {
          sendToExtension({
            type: 'fetch',
            request: requestInfo,
            response: {
              status: cloned.status,
              statusText: cloned.statusText,
              headers: normalizeHeaders(Object.fromEntries(cloned.headers.entries())),
              body: bodyText
            }
          });
        }

        return response;
      } catch (error) {
        // Forward failure without body
        sendToExtension({
          type: 'fetch',
          request: requestInfo,
          response: {
            status: 0,
            statusText: 'Network Error',
            headers: {},
            body: ''
          }
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
    this._interceptedMethod = method;
    this._interceptedUrl = url;
    this._interceptedRequestTime = Date.now();
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    this._interceptedBody = body;

    const handleResponse = () => {
      try {
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

        const contentType = headers['content-type'] || '';
        if (!isJsonContentType(contentType)) return; // Only JSON

        let responseBody;
        if (this.responseType === '' || this.responseType === 'text') {
          responseBody = this.responseText;
        } else if (this.responseType === 'json') {
          responseBody = JSON.stringify(this.response);
        } else {
          return; // non-textual, skip
        }

        if (responseBody && responseBody.trim().length) {
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
              headers: normalizeHeaders(headers),
              body: responseBody
            }
          });
        }
      } catch (error) {
        // swallow
      }
    };

    this.addEventListener('load', handleResponse);
    this.addEventListener('readystatechange', () => {
      if (this.readyState === 4) {
        setTimeout(handleResponse, 10);
      }
    });

    this.addEventListener('error', () => {
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
          body: ''
        }
      });
    });

    return origSend.call(this, body);
  };

  console.log('✅ XMLHttpRequest interceptor installed');
  console.log('🎯 API Data Visualizer interceptor fully loaded and ready');
})();