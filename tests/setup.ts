import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(cleanup);
if (!HTMLElement.prototype.hasPointerCapture)
  HTMLElement.prototype.hasPointerCapture = () => false;
if (!HTMLElement.prototype.setPointerCapture)
  HTMLElement.prototype.setPointerCapture = () => {};
if (!HTMLElement.prototype.releasePointerCapture)
  HTMLElement.prototype.releasePointerCapture = () => {};
if (!HTMLElement.prototype.scrollIntoView)
  HTMLElement.prototype.scrollIntoView = () => {};
