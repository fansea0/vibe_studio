import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import App from '../../src/app/App'

describe('App', () => {
  it('renders the product overview heading', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: '产品总览' }),
    ).toBeInTheDocument()
  })
})
