import { createApp } from "vue";
import "mdui/mdui.css";
import "mdui/components/button.js";
import "mdui/components/text-field.js";
import "mdui/components/switch.js";
import { setColorScheme } from "mdui/functions/setColorScheme.js";
import App from "./App.vue";
import "./styles.css";

setColorScheme("#536b56");
createApp(App).mount("#app");
