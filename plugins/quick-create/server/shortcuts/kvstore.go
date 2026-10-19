// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package shortcuts

import (
	"encoding/json"

	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/pkg/errors"
)

const keyPrefix = "sc_"

// KVStore keeps each channel's shortcuts under its own key. Values are raw JSON bytes so
// CompareAndSwap compares exactly what was read.
type KVStore struct {
	kv *pluginapi.KVService
}

func NewKVStore(kv *pluginapi.KVService) *KVStore { return &KVStore{kv: kv} }

func (s *KVStore) Get(channelID string) ([]Shortcut, []byte, error) {
	var raw []byte
	if err := s.kv.Get(keyPrefix+channelID, &raw); err != nil {
		return nil, nil, errors.Wrap(err, "failed to read shortcuts")
	}
	if len(raw) == 0 {
		return nil, nil, nil
	}
	var list []Shortcut
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, nil, errors.Wrap(err, "failed to decode shortcuts")
	}
	return list, raw, nil
}

func (s *KVStore) CompareAndSwap(channelID string, old []byte, list []Shortcut) (bool, error) {
	var value any // an empty list deletes the key
	if len(list) > 0 {
		raw, err := json.Marshal(list)
		if err != nil {
			return false, err
		}
		value = raw
	}
	ok, err := s.kv.Set(keyPrefix+channelID, value, pluginapi.SetAtomic(old))
	return ok, errors.Wrap(err, "failed to save shortcuts")
}
