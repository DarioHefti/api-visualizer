// Prevent multiple injections on the same page
if (!window.__INTERCEPTOR_INJECTED__) {
  window.__INTERCEPTOR_INJECTED__ = true;
  
  console.log('🔧 Content script loaded on:', window.location.href);
  
  // Try direct injection first (fallback method)
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
      console.log('✅ Injected script loaded directly');
      this.remove();
    };
    script.onerror = function() {
      console.warn('❌ Direct injection failed, trying background method');
      // Fallback to background script injection
      chrome.runtime.sendMessage({ type: 'inject_script' });
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.warn('Direct injection error:', error);
    // Fallback to background script injection
    chrome.runtime.sendMessage({ type: 'inject_script' });
  }
}

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data.__FROM_PAGE__) return;
  
  console.log('📨 Received message from injected script:', event.data.payload?.type, event.data.payload?.request?.url);
  
  try {
    chrome.runtime.sendMessage({ type: 'intercepted', data: event.data.payload });
  } catch (error) {
    console.warn('Failed to send intercepted data:', error);
  }
});

// Add debugging for page lifecycle
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 DOM Content Loaded, interceptor should be active');
});

// Check if the injected script is working after a delay
setTimeout(() => {
  if (!window.__FETCH_XHR_INTERCEPTOR_LOADED__) {
    console.warn('⚠️ Injected script not detected after 5 seconds, injection may have failed');
    // Try re-injection
    chrome.runtime.sendMessage({ type: 'inject_script' });
  } else {
    console.log('✅ Injected script confirmed active');
  }
}, 5000);
