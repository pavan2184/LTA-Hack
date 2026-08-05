import "@testing-library/jest-dom/vitest";

// The route logs every rejected request, which is the point of it — but it
// makes the test output unreadable. Assertions cover the behaviour instead.
process.env.LOG_LEVEL = "silent";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;
