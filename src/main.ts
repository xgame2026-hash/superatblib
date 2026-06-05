import { createApp } from "vue";
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDialog,
  ElForm,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from "element-plus";
import "element-plus/theme-chalk/base.css";
import "element-plus/theme-chalk/el-alert.css";
import "element-plus/theme-chalk/el-button.css";
import "element-plus/theme-chalk/el-checkbox.css";
import "element-plus/theme-chalk/el-dialog.css";
import "element-plus/theme-chalk/el-form.css";
import "element-plus/theme-chalk/el-icon.css";
import "element-plus/theme-chalk/el-input.css";
import "element-plus/theme-chalk/el-input-number.css";
import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-message-box.css";
import "element-plus/theme-chalk/el-overlay.css";
import "element-plus/theme-chalk/el-popper.css";
import "element-plus/theme-chalk/el-select.css";
import "element-plus/theme-chalk/el-slider.css";
import "element-plus/theme-chalk/el-switch.css";
import "element-plus/theme-chalk/el-table.css";
import "element-plus/theme-chalk/el-tag.css";
import "element-plus/theme-chalk/el-tooltip.css";
import "./styles.css";
import App from "./App.vue";

const app = createApp(App);

[
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDialog,
  ElForm,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
].forEach((component) => app.use(component));

app.mount("#app");
