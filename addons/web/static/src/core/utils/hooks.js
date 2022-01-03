/** @odoo-module **/

import { SERVICES_METADATA } from "@web/env";

const { useComponent, useEffect, useRef } = owl;

/**
 * This file contains various custom hooks.
 * Their inner working is rather simple:
 * Each custom hook simply hooks itself to any number of owl lifecycle hooks.
 * You can then use them just like an owl hook in any Component
 * e.g.:
 * import { useBus } from "@web/core/utils/hooks";
 * ...
 * setup() {
 *    ...
 *    useBus(someBus, someEvent, callback)
 *    ...
 * }
 */

// -----------------------------------------------------------------------------
// useAutofocus
// -----------------------------------------------------------------------------

/**
 * Focus a dom element with provided ref as soon as it appears in the DOM and if it was not
 * displayed before. If it is an input|textarea, set the selection
 * at the end.
 * @param {string} [refName="autofocus"]
 * @returns {Function} function that forces the focus on the next update if visible.
 */
export function useAutofocus(refName = "autofocus") {
    const comp = useComponent();
    // Prevent autofocus in mobile
    if (comp.env.isSmall) {
        return () => {};
    }
    let ref = useRef(refName);
    let forceFocusCount = 0;
    useEffect(
        (el) => {
            if (el) {
                el.focus();
                if (["INPUT", "TEXTAREA"].includes(el.tagName)) {
                    el.selectionStart = el.selectionEnd = el.value.length;
                }
            }
        },
        () => [ref.el, forceFocusCount]
    );
    return function focusOnUpdate() {
        forceFocusCount++; // force the effect to rerun on next patch
    };
}

// -----------------------------------------------------------------------------
// useBus
// -----------------------------------------------------------------------------

/**
 * Ensures a bus event listener is attached and cleared the proper way.
 *
 * @param {EventBus} bus
 * @param {string} eventName
 * @param {Callback} callback
 */
export function useBus(bus, eventName, callback) {
    const component = useComponent();
    useEffect(
        () => {
            const listener = callback.bind(component);
            bus.addEventListener(eventName, listener);
            return () => bus.removeEventListener(eventName, listener);
        },
        () => []
    );
}

// -----------------------------------------------------------------------------
// useListener
// -----------------------------------------------------------------------------

/**
 * The useListener hook offers an alternative to Owl's classical event
 * registration mechanism (with attribute 't-on-eventName' in xml).
 *
 * It is especially useful for abstract components, meant to be extended by
 * specific ones. If those abstract components need to define event handlers,
 * but don't have any template (because the template completely depends on
 * specific cases), then using the 't-on' mechanism isn't adequate, as the
 * handlers would be lost by the template override. In this case, using this
 * hook instead is more convenient.
 *
 * Usage: like all Owl hooks, this function has to be called in the
 * constructor of an Owl component:
 *
 *   useListener('click', () => { console.log('clicked'); });
 *
 * It also allows to do event delegation, by specifying a native query selector
 * as second argument. In this case, the handler is only called if the event
 * is triggered on an element matching the given selector.
 *
 *   useListener('click', 'button', () => { console.log('clicked'); });
 *
 * Note: components that alter the event's target (e.g. Portal) are not
 * expected to behave as expected with event delegation.
 *
 * @param {string} eventName the name of the event
 * @param {string} [querySelector] a JS native selector for event delegation
 * @param {function} handler the event handler (will be bound to the component)
 * @param {Object} [options] to be passed to addEventListener as options.
 *   Useful for listening in the capture phase
 */
export function useListener(eventName, querySelector, handler, options = {}) {
    if (typeof arguments[1] !== "string") {
        querySelector = null;
        handler = arguments[1];
        options = arguments[2] || {};
    }
    if (typeof handler !== "function") {
        throw new Error("The handler must be a function");
    }

    const comp = useComponent();
    let boundHandler;
    if (querySelector) {
        boundHandler = function (ev) {
            let el = ev.target;
            let target;
            while (el && !target) {
                if (el.matches(querySelector)) {
                    target = el;
                } else if (el === comp.el) {
                    el = null;
                } else {
                    el = el.parentElement;
                }
            }
            if (el) {
                handler.call(comp, ev);
            }
        };
    } else {
        boundHandler = handler.bind(comp);
    }
    useEffect(
        () => {
            comp.el.addEventListener(eventName, boundHandler, options);
            return () => {
                comp.el.removeEventListener(eventName, boundHandler, options);
            };
        },
        () => []
    );
}

// -----------------------------------------------------------------------------
// useService
// -----------------------------------------------------------------------------

function _protectMethod(component, caller, fn) {
    return async (...args) => {
        if (component.__owl__.status === 2 /** NXOWL CHECK **/ /* DESTROYED */) {
            throw new Error("Component is destroyed");
        }
        const result = await fn.call(caller, ...args);
        return component.__owl__.status === 2 /** NXOWL CHECK **/ ? new Promise(() => {}) : result;
    };
}

/**
 * Import a service into a component
 *
 * @param {string} serviceName
 * @returns {any}
 */
export function useService(serviceName) {
    const component = useComponent();
    const { services } = component.env;
    if (!(serviceName in services)) {
        throw new Error(`Service ${serviceName} is not available`);
    }
    const service = services[serviceName];
    if (serviceName in SERVICES_METADATA) {
        if (service instanceof Function) {
            return _protectMethod(component, null, service);
        } else {
            const methods = SERVICES_METADATA[serviceName];
            const result = Object.create(service);
            for (let method of methods) {
                result[method] = _protectMethod(component, service, service[method]);
            }
            return result;
        }
    }
    return service;
}
