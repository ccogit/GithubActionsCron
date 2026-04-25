#!/usr/bin/env python3
"""Quick test to see if FMP API key works and has DAX data."""

import os
import sys
import requests

FMP_API_KEY = os.environ.get("FMP_API_KEY")

if not FMP_API_KEY:
    print("ERROR: FMP_API_KEY not set")
    sys.exit(1)

print(f"Testing FMP API with key: {FMP_API_KEY[:10]}...")

# Test with a few DAX stocks (with .DE suffix)
test_symbols = ["SAP.DE", "SIE.DE", "BAYN.DE", "BMW.DE", "MRK.DE"]

for symbol in test_symbols:
    url = f"https://financialmodelingprep.com/api/v3/price-target-consensus?symbol={symbol}&apikey={FMP_API_KEY}"
    try:
        r = requests.get(url, timeout=10)
        data = r.json()
        print(f"\n{symbol}: status={r.status_code}")
        if isinstance(data, list) and len(data) > 0:
            consensus = data[0]
            target = consensus.get("priceTargetConsensus")
            n_analysts = consensus.get("numberOfAnalysts")
            if target and n_analysts:
                print(f"  → {n_analysts} analysts, target: ${target:.2f}")
            else:
                print(f"  → No target data (target={target}, analysts={n_analysts})")
        else:
            print(f"  → No data returned")
    except Exception as e:
        print(f"{symbol}: Error - {e}")
