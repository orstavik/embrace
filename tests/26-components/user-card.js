import { embrace } from "../../src/v25x.js";

/**
 * A reusable Custom Element that wraps the Embrace template engine.
 * Demonstrates how to encapsulate template logic and rendering.
 */
export class EmbraceUserCard extends HTMLElement {
    constructor() {
        super();
        this._data = {};
        this._helpers = {
            getInitials: (name) => name.split(' ').map(n => n[0]).join(''),
            formatRole: (role) => role.toUpperCase()
        };
    }

    set data(value) {
        this._data = value;
        this.render();
    }

    connectedCallback() {
        // We expect a <template> to be provided inside the element or we define one here.
        // For this demo, the template is defined inside the Custom Element in index.html
        this.render();
    }

    render() {
        if (!this._data || !this.firstElementChild) return;

        // Merge data with helpers for the template context
        const context = { ...this._data, ...this._helpers };

        // Call embrace on this element. 
        // Note: embrace() looks for the first child <template>
        embrace(this, context);
    }
}

// Register the component
if (!customElements.get('embrace-user-card')) {
    customElements.define('embrace-user-card', EmbraceUserCard);
}

console.log("User card component loaded and registered.");
