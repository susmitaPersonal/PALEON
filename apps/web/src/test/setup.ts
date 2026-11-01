import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

URL.createObjectURL = () => "blob:preview";
URL.revokeObjectURL = () => {};
window.scrollTo = () => {};
